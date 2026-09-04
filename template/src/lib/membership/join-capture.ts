// ============================================================================
// Capturing a membership join made AT THE CHECKOUT. Card pktBo874.
//
// Called from `placeOrder` after the order row exists. It resolves (or creates) the person the
// checkout named, mints a `membership_activation` token and emails them the activation link — the
// journey Tim's storyboard draws.
//
// THREE HARD RULES, all enforced here rather than in the UI:
//
//  1. **Nothing is charged.** No subscription row is written, no Stripe object is created. The
//     membership is confirmed with a card on the existing `/account/membership/subscribe` page, so
//     the staff Members list (surface `membership-overview`) never gains a "member" who has not
//     paid, and nobody is billed for ticking a box beside a Pay Now button.
//  2. **It can never fail the order.** Every step is wrapped and the function resolves to a
//     result rather than throwing. A shopper's order must not be lost because a marketing opt-in
//     could not send an email — the same rule the below-cost sentry and the member-savings stamp
//     already follow on this surface.
//  3. **A join may not rewrite somebody else's record.** Chefs Depot keeps guest checkout on, so
//     anybody can type a known customer's address here. On a contact this join did not create we
//     only ever FILL A BLANK (`membershipJoinMetafieldPatch`); the activation link is safe because
//     it lands in that address's own inbox, but the birthday and the phone belong to the person,
//     not to whoever typed the address.
// ============================================================================

import {
  CHANNEL_ID,
  contactService,
  customerAuthTokenService,
  getSubscriptionPlans,
  getSiteConfig,
} from "@/lib/store";
import { createAccountlessContact, EmailTakenError, mergeContactMetafields } from "@/lib/contact-auth";
import { siteBaseUrl } from "@/lib/seo";
import {
  resolveEmailBranding,
  sendMembershipActivationEmail,
  wantsStripeTestMode,
} from "@keenan/services";
import {
  MEMBERSHIP_ACTIVATION_TTL_DAYS,
  MEMBERSHIP_ACTIVATION_TTL_MINUTES,
  membershipJoinMetafieldPatch,
  planPriceLine,
  type MembershipJoinIntent,
} from "./checkout-join";

export interface MembershipJoinResult {
  /** The person the join was recorded against, when we got that far. */
  contactId: number | null;
  /** True when the activation email actually left SES. */
  emailed: boolean;
  /** Why nothing happened, for the order's metafields. Never shown to a customer. */
  reason?: string;
}

/** What we already hold about a contact the join did NOT create. Null for a brand-new person. */
type HeldContact = { metafields: Record<string, unknown> | null; phone: string | null } | null;

/**
 * Everything the join is not allowed to overwrite, in the shape the pure patch builder reads.
 * A phone already on the contact ROW counts as one we hold, so a stranger's number is not filed
 * beside it as `checkout_phone`.
 */
function heldValues(held: HeldContact): Record<string, unknown> | null {
  if (!held) return null;
  return {
    ...(held.metafields ?? {}),
    ...(held.phone && held.phone.trim() ? { checkout_phone: held.phone } : {}),
  };
}

/**
 * Record the join and email the activation link.
 *
 * @param intent  what the checkout posted, already validated by `membershipJoinIntent`
 * @param order   the order the join rode in on — carried in the token so the activation page can
 *                say which order it came from, and stamped on the order so staff can see it
 */
export async function captureMembershipJoin(
  intent: MembershipJoinIntent,
  order: { id?: number | null; number?: string | null }
): Promise<MembershipJoinResult> {
  try {
    // 1. Who is this? A shopper who already has a row on this storefront keeps it — a second
    //    accountless row for the same (channel, email) is refused by the database anyway, and
    //    joining must never fork a person's identity.
    let contactId: number | null = null;
    let hasPassword = false;
    // Null while this join is CREATING the person; a row once we are writing to somebody else's.
    let held: HeldContact = null;

    const readHeld = async (id: number): Promise<HeldContact> => {
      const row = (await contactService.getById(id).catch(() => null)) as
        | { metafields?: Record<string, unknown> | null; phone?: string | null }
        | null;
      return { metafields: row?.metafields ?? null, phone: row?.phone ?? null };
    };

    const existing = (await contactService
      .findLoginCandidate(intent.email, CHANNEL_ID)
      .catch(() => null)) as { id: number; password_hash: string | null } | null;

    if (existing) {
      contactId = existing.id;
      hasPassword = !!existing.password_hash;
      held = await readHeld(existing.id);
    } else {
      try {
        const created = await createAccountlessContact({
          email: intent.email,
          firstName: intent.firstName || null,
          lastName: intent.lastName || null,
          // Same markers a self-service registration carries. `email_verified` stays false until
          // the emailed link is followed — it is what gates email-matched net terms, and a
          // checkout tick box proves nothing about an inbox.
          metafields: { self_registered: true, email_verified: false },
        });
        contactId = created.id;
      } catch (e) {
        if (e instanceof EmailTakenError) {
          // Lost a race with a concurrent register/join — re-resolve rather than give up.
          const raced = (await contactService
            .findLoginCandidate(intent.email, CHANNEL_ID)
            .catch(() => null)) as { id: number; password_hash: string | null } | null;
          contactId = raced?.id ?? null;
          hasPassword = !!raced?.password_hash;
          if (raced?.id) held = await readHeld(raced.id);
        } else {
          throw e;
        }
      }
    }

    if (contactId == null) {
      return { contactId: null, emailed: false, reason: "no contact" };
    }

    // 2. Stamp the join on the person. The birthday is optional and only written when it parsed
    //    (see normaliseDateOfBirth) — a value we cannot trust is worse than none on a reward — and
    //    on an EXISTING contact only where we hold nothing (rule 3 above).
    await mergeContactMetafields(contactId, membershipJoinMetafieldPatch(intent, heldValues(held))).catch(
      (e) => {
        console.error("[captureMembershipJoin] metafields stamp failed (non-fatal):", e);
      }
    );

    // 3. The plan is what the email names and prices. No plan on this channel means membership is
    //    not something this storefront sells, and the tick should never have been drawn.
    const plans = await getSubscriptionPlans().catch(() => []);
    const plan = plans[0] as
      | { name?: string; slug?: string; price?: string | number; billing_interval?: string }
      | undefined;
    if (!plan) {
      return { contactId, emailed: false, reason: "no plan" };
    }

    // 4. The link. Seven days, because it arrives with an order confirmation and is read whenever
    //    the customer next opens their inbox — the 30 minutes an auth token gets would strand
    //    almost everyone who ticked the box.
    const { token } = await customerAuthTokenService.createToken({
      contactId,
      type: "membership_activation",
      ttlMinutes: MEMBERSHIP_ACTIVATION_TTL_MINUTES,
      payload: {
        plan_slug: plan.slug ?? null,
        order_id: order.id ?? null,
        order_number: order.number ?? null,
        // Recorded so the activation page can tell a returning account holder to sign in rather
        // than offering to set a password over the top of one they already have.
        had_password: hasPassword,
      },
    });

    // 5. Send it, branded as this storefront (never Keenan red), recorded on this person's
    //    Contact history, and told which storefront asked.
    const { site, channel } = await getSiteConfig();
    const resolved = await resolveEmailBranding(CHANNEL_ID).catch(() => undefined);
    const branding =
      resolved ?? {
        storeName: site?.siteName || channel?.name || "Keenan Group",
        logoUrl: site?.logoUrl ?? null,
        logoAlt: site?.logoAlt ?? null,
        siteUrl: siteBaseUrl(site?.url),
        fromEmail: site?.fromEmail ?? null,
      };
    const baseUrl = branding.siteUrl || siteBaseUrl(site?.url);
    const testMode = await wantsStripeTestMode(CHANNEL_ID).catch(() => false);

    const emailed = await sendMembershipActivationEmail({
      to: intent.email,
      activationUrl: `${baseUrl}/membership/activate/${token}`,
      memberName: intent.firstName || undefined,
      planName: plan.name || "membership",
      priceLine: planPriceLine(plan.price, plan.billing_interval) ?? undefined,
      branding,
      testMode,
      contactId,
      channelId: CHANNEL_ID,
      expiresDays: MEMBERSHIP_ACTIVATION_TTL_DAYS,
      // The copy has to be true for the person reading it: somebody who already has a password is
      // asked to CONFIRM their details, never to "set a password" the activation page then refuses
      // to let them set.
      hasPassword,
    });

    return { contactId, emailed, reason: emailed ? undefined : "send failed" };
  } catch (e) {
    console.error("[captureMembershipJoin] failed (non-fatal):", e);
    return { contactId: null, emailed: false, reason: "error" };
  }
}
