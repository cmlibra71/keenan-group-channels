// Pure guest-customer-record policy (card LiuLvc5b) — no DB, no `@/` imports, so
// every branch is unit-tested rather than eyeballed (see guest-contact-policy.test.ts).
// The impure half — the reads and writes against `contacts` — lives in
// guest-contact.ts, exactly as net-terms-policy.ts sits under net-terms.ts.

/**
 * The metafield that says "this row is a checkout's record of a sale, not an
 * account". It is the ONLY thing that makes a row claimable by a later
 * registration, so it is written in one place and read in one place.
 */
export const GUEST_CHECKOUT_MARKER = "guest_checkout";

/**
 * The metafields a checkout-created contact is born with.
 *
 * `self_registered` rides along for one narrow reason: net terms fail CLOSED on
 * `self_registered && !email_verified` (net-terms-policy.ts), and the marker's
 * real meaning is "this inbox was never proven" — which is exactly true of an
 * address typed into a checkout. Without it, a record created from a typed
 * address could later carry an account's terms on the weak email-string arm.
 * Every way INTO this row (Google sign-in, the activation email, a claim at
 * registration) proves or re-states ownership, so nobody legitimate is denied.
 */
export function guestContactMetafields(): Record<string, unknown> {
  return { [GUEST_CHECKOUT_MARKER]: true, self_registered: true, email_verified: false };
}

/** Trim + lowercase — what the DB's unique index and every matcher compare on. */
export function normaliseContactEmail(email: string | null | undefined): string | null {
  const v = (email ?? "").trim().toLowerCase();
  return v ? v : null;
}

/**
 * Is this login candidate merely a checkout's record of a sale?
 *
 * It exists because a record is not an account. The checkout's returning-customer
 * hint ("you already have an account — sign in") is driven by
 * `findLoginCandidate`, which happily returns a passwordless row; before this card
 * the only passwordless rows were B2B contacts awaiting activation and Google-only
 * shoppers, and telling either of them to sign in is right. Telling a repeat GUEST
 * they have an account they never made is wrong words on a customer-facing page,
 * and it would send them to a sign-in they cannot complete. So the hint asks this
 * first.
 *
 * A row that has been claimed (it has a password) or proven (a Google sign-in
 * stamps `email_verified`) is a real account again and answers false — which is
 * also precisely the set the claim refuses to take over.
 */
export function isUnclaimedGuestRecord(
  row:
    | { password_hash?: string | null; metafields?: Record<string, unknown> | null }
    | null
    | undefined
): boolean {
  if (!row) return false;
  if (row.password_hash) return false;
  const meta = (row.metafields ?? {}) as Record<string, unknown>;
  return meta[GUEST_CHECKOUT_MARKER] === true && meta.email_verified !== true;
}
