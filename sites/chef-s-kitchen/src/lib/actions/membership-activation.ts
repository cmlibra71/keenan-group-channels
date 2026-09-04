"use server";

// ============================================================================
// Finishing a membership join that started at the checkout. Card pktBo874.
//
// The activation page walks three steps in the browser (account details, address details,
// membership details) and posts ONCE, here. One submit means the token is consumed exactly once,
// on an explicit action — never on a page load, which is the rule that keeps an email scanner from
// burning somebody's link.
//
// What this does NOT do: take money. It activates the ACCOUNT — password, details, address,
// birthday — and hands the customer to the existing subscribe page, which is the one place on the
// storefront that creates a subscription. Tim's screenshot titles it "Activate your MYER one
// account" for the same reason.
// ============================================================================

import { redirect } from "next/navigation";
import { contactService, customerAuthTokenService, getSubscriptionPlans } from "@/lib/store";
import { setSession } from "@/lib/auth";
import { mergeContactMetafields } from "@/lib/contact-auth";
import { saveCheckoutAddressForContact } from "@/lib/contact-addresses";
import { repriceCartForSession } from "@/lib/actions/cart";
import { enforceLimit } from "@/lib/security/rate-limits";
import { normaliseDateOfBirth } from "@/lib/membership/checkout-join";
import { validateAccountStep, validateAddressStep } from "@/lib/membership/activation";

const INVALID_LINK =
  "This activation link is invalid or has expired. Please contact us and we'll send a new one.";

export interface ActivateMembershipInput {
  token: string;
  firstName: string;
  lastName: string;
  phone: string;
  password: string;
  confirmPassword: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  postalCode: string;
  dateOfBirth: string;
}

/**
 * Consume the activation token, set the customer up, sign them in, and send them to the step that
 * actually starts the membership.
 *
 * Returns `{ error }` on failure; on success it REDIRECTS and never returns.
 */
export async function activateMembership(
  input: ActivateMembershipInput
): Promise<{ error?: string }> {
  const token = (input.token || "").trim();
  if (!token) return { error: INVALID_LINK };

  // Per-IP only: guessing a token is the attack, and there is no account to key a second bucket on
  // until one resolves. Same bucket the reset-password submit uses, for the same reason.
  const limit = await enforceLimit("password_reset_submit", { surface: "membership activation" });
  if (!limit.allowed) return { error: limit.message };

  // Validate BEFORE consuming: a token spent on a form that then failed validation would strand
  // the customer with a dead link and nothing to show for it.
  const addressResult = validateAddressStep({
    address1: input.address1,
    address2: input.address2,
    city: input.city,
    state: input.state,
    postalCode: input.postalCode,
  });
  if ("error" in addressResult) return { error: addressResult.error };

  // Peek to learn whether this person already has a password. The token must never set one over
  // the top of an existing password — see the note on `validateAccountStep`.
  const peeked = await customerAuthTokenService
    .peekToken(token, "membership_activation")
    .catch(() => null);
  if (!peeked || peeked.contactId == null) return { error: INVALID_LINK };

  const existing = (await contactService.getById(peeked.contactId).catch(() => null)) as
    | { email: string; password_hash: string | null }
    | null;
  if (!existing) return { error: INVALID_LINK };

  const accountError = validateAccountStep({
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
    password: input.password,
    confirmPassword: input.confirmPassword,
    hasPassword: !!existing.password_hash,
  });
  if (accountError) return { error: accountError };

  // Everything checks out — now spend the link. The atomic UPDATE inside consumeToken is what
  // makes a double submit impossible.
  const consumed = await customerAuthTokenService
    .consumeToken(token, "membership_activation")
    .catch(() => null);
  if (!consumed || consumed.contactId !== peeked.contactId) return { error: INVALID_LINK };

  const contactId = consumed.contactId;

  // The password, the name and the phone. `contactService.update` hashes plaintext `password`
  // to bcrypt itself.
  await contactService.update(contactId, {
    password: input.password,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    ...(input.phone.trim() ? { phone: input.phone.trim() } : {}),
  });

  // Following the emailed link proves they control the inbox — the same stamp the account
  // activation flow makes, and what gates email-matched net terms.
  const dateOfBirth = normaliseDateOfBirth(input.dateOfBirth);
  await mergeContactMetafields(contactId, {
    email_verified: true,
    membership_activated_at: new Date().toISOString(),
    ...(dateOfBirth ? { date_of_birth: dateOfBirth } : {}),
  }).catch((e) => {
    console.error("[activateMembership] metafields stamp failed (non-fatal):", e);
  });

  // Their address book. Best-effort and de-duplicated: the first address a contact saves becomes
  // their defaults, and a later one never displaces a default they already chose — the ONE rule
  // shared with checkout's "save this address" and with the account Address Book.
  try {
    await saveCheckoutAddressForContact(contactId, {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      company: "",
      phone: input.phone.trim(),
      address1: addressResult.address.address1,
      address2: addressResult.address.address2,
      city: addressResult.address.city,
      stateOrProvince: addressResult.address.state,
      postalCode: addressResult.address.postalCode,
      country: "Australia",
      countryCode: "AU",
    });
  } catch (e) {
    console.error("[activateMembership] address not saved (non-fatal):", e);
  }

  // Sign them in on THIS device — and re-price the basket, because signing in changes the price a
  // shopper is charged and cart lines store their price at ADD time. This is the sixth sign-in
  // path on the storefront and the register names an activation flow as exactly the case that
  // re-opens card 7Yie3iPX's defect if it forgets.
  await setSession(contactId, existing.email);
  await repriceCartForSession();

  // Straight to the one place that starts a membership. The plan slug rides in the token so a
  // renamed plan cannot strand a link that was already sent.
  const payloadSlug = (consumed.payload as { plan_slug?: string | null } | null)?.plan_slug;
  let slug = typeof payloadSlug === "string" && payloadSlug ? payloadSlug : null;
  if (!slug) {
    const plans = (await getSubscriptionPlans().catch(() => [])) as { slug?: string }[];
    slug = plans[0]?.slug ?? null;
  }
  redirect(slug ? `/account/membership/subscribe/${slug}` : "/membership");
}
