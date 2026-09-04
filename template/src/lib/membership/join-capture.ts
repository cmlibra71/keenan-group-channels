// ============================================================================
// Capturing a membership join made AT THE CHECKOUT. Card pktBo874.
//
// Called from `placeOrder` after the order row exists. It resolves (or creates) the person the
// checkout named, mints a `membership_activation` token and emails them the activation link — the
// journey Tim's storyboard draws.
//
// TWO HARD RULES, both about money and both enforced here rather than in the UI:
//
//  1. **Nothing is charged.** No subscription row is written, no Stripe object is created. The
//     membership is confirmed with a card on the existing `/account/membership/subscribe` page, so
//     the staff Members list (surface `membership-overview`) never gains a "member" who has not
//     paid, and nobody is billed for ticking a box beside a Pay Now button.
//  2. **It can never fail the order.** Every step is wrapped and the function resolves to a
//     result rather than throwing. A shopper's order must not be lost because a marketing opt-in
//     could not send an email — the same rule the below-cost sentry and the member-savings stamp
//     already follow on this surface.
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
    const existing = (await contactService
      .findLoginCandidate(intent.email, CHANNEL_ID)
      .catch(() => null)) as { id: number; password_hash: string | null } | null;

    if (existing) {
      contactId = existing.id;
      hasPassword = !!existing.password_hash;
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
        } else {
          throw e;
        }
      }
    }

    if (contactId == null) {
      return { contactId: null, emailed: false, reason: "no contact" };
    }

    // 2. Stamp the join on the person. The birthday is optional and only written when it parsed
    //    (see normaliseDateOfBirth) — a value we cannot trust is worse than none on a reward.
    await mergeContactMetafields(contactId, {
      membership_join_requested_at: new Date().toISOString(),
      ...(intent.dateOfBirth ? { date_of_birth: intent.dateOfBirth } : {}),
      // Phone is prefill for the activation page, and only when we do not already hold one —
      // the contact record is the person's, not this one order's.
      ...(intent.phone ? { checkout_phone: intent.phone } : {}),
    }).catch((e) => {
      console.error("[captureMembershipJoin] metafields stamp failed (non-fatal):", e);
    });

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
    });

    return { contactId, emailed, reason: emailed ? undefined : "send failed" };
  } catch (e) {
    console.error("[captureMembershipJoin] failed (non-fatal):", e);
    return { contactId: null, emailed: false, reason: "error" };
  }
}
