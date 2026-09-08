// ============================================================================
// Every completed checkout attaches a customer record (card LiuLvc5b).
//
// A guest checkout writes `orders.contact_id = NULL` unless the billing address
// already belongs to somebody: card lpMsJZMM taught `OrderService.create` to
// stamp the accountless contact for the order's own storefront when one exists.
// What it deliberately does NOT do is invent a person — "a billing email that
// matches no contact resolves to null: a guest stays a guest". That is the gap
// this file closes. A first-time guest now leaves a real CONTACT behind — a
// person, not a business Account (Accounts stay businesses-only, rsVWkf2C) —
// built from their billing details and stamped with the channel it happened on,
// so the sale and the buyer arrive in the portal together.
//
// FOUR RULES SHAPE THIS FILE.
//
// 1. WE ONLY EVER CREATE THE ROW A REGISTRATION WOULD HAVE CREATED. The test is
//    `contactService.isEmailAvailableForChannel` — the same predicate
//    `/account/register` uses — so the contact minted here is provably the row
//    the shopper will later sign in AS (the DB's partial unique index,
//    `(coalesce(origin_channel_id,0), lower(email))` WHERE account_id IS NULL,
//    makes it unique). When that predicate says no, somebody already represents
//    this address on this site and we create NOTHING:
//      * an accountless same-site row — the order is already stamped with it by
//        the lpMsJZMM rule, so there is nothing left to do;
//      * a contact linked to an ACCOUNT — that person already has a record, and
//        minting an accountless twin would shadow their login (findLoginCandidate
//        prefers the accountless row) and could hand or deny them net terms.
//        The order stays a guest order and the portal resolves the buyer at READ
//        time, exactly as it does today.
//    That is also why we never stamp the order with a contact this file did not
//    create: the write rule at the foot of `order-contact-link.ts` is narrower
//    than the read rule on purpose, and it is not ours to widen.
//
// 2. THE SITE IS PART OF THE IDENTITY. Chefs Depot and Industry Kitchens are
//    separate businesses whose records never cross over (Tim, k6pHXQBf), and the
//    same person legitimately holds one row per storefront. `origin_channel_id`
//    is stamped with the channel the checkout happened on, and an address known
//    only on the other site gets its own row here — which is the point.
//
// 3. NOTHING HERE GRANTS A SIGN-IN. No password hash is written and no session
//    is created: it is a record of a sale, not an account. `guest_checkout: true`
//    says so, and is what lets a later registration on the same address CLAIM
//    this row rather than dead-end on "email taken" (see the claim below).
//    `self_registered: true` rides with it for one narrow reason spelled out at
//    the write.
//
// 4. IT RUNS AFTER THE ORDER EXISTS. No record is created by a save that failed
//    (Product Brief), so the caller invokes this only once the order and its
//    line items are persisted, and every failure in here is swallowed: an order
//    must never be lost because we could not file a customer record.
// ============================================================================

import { getCommerceClient } from "@keenan/services";
import { contactService } from "@/lib/store";
import { CHANNEL_ID } from "@/lib/channel";
import {
  GUEST_CHECKOUT_MARKER,
  guestContactMetafields,
  normaliseContactEmail,
} from "@/lib/checkout/guest-contact-policy";

/** jsonb bound as text + explicit cast — same reason as lib/contact-auth.ts. */
const asJsonText = (v: Record<string, unknown>): string => JSON.stringify(v ?? {});

export interface GuestContactInput {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
}

/** The accountless contact for (this channel, this address), or null. */
async function accountlessContactId(email: string): Promise<number | null> {
  const sql = getCommerceClient();
  if (!sql) return null;
  const rows = await sql<{ id: number }[]>`
    SELECT id FROM contacts
    WHERE account_id IS NULL
      AND coalesce(origin_channel_id, 0) = ${CHANNEL_ID}
      AND lower(email) = ${email}
    LIMIT 1`;
  return rows[0]?.id ?? null;
}

/**
 * Create the customer record for a guest checkout, and return its id.
 *
 * Returns null when there is nothing to do — no usable address, the address is
 * already represented on this site (see rule 1 above), or the write failed. The
 * caller then leaves the order exactly as the checkout wrote it.
 */
export async function createGuestContactForCheckout(
  input: GuestContactInput
): Promise<number | null> {
  const email = normaliseContactEmail(input.email);
  if (!email) return null;

  const sql = getCommerceClient();
  if (!sql) return null;

  try {
    if (!(await contactService.isEmailAvailableForChannel(email, CHANNEL_ID))) return null;

    const firstName = (input.firstName ?? "").trim() || null;
    const lastName = (input.lastName ?? "").trim() || null;
    const phone = (input.phone ?? "").trim() || null;

    try {
      const [row] = await sql<{ id: number }[]>`
        INSERT INTO contacts (
          account_id, origin_channel_id, email, password_hash,
          first_name, last_name, phone, is_active, attributes, metafields
        ) VALUES (
          NULL, ${CHANNEL_ID}, ${email}, NULL,
          ${firstName}, ${lastName}, ${phone}, true,
          '{}'::jsonb,
          ${asJsonText(guestContactMetafields())}::jsonb
        )
        RETURNING id`;
      return row?.id ?? null;
    } catch (e) {
      // 23505: two guest checkouts on the same address raced for the slot. The
      // other one won — use their row rather than losing the link.
      if ((e as { code?: string })?.code !== "23505") throw e;
      return await accountlessContactId(email);
    }
  } catch (e) {
    console.error("[createGuestContactForCheckout] failed (non-fatal):", e);
    return null;
  }
}

/** What a successful claim hands back — the shape `setSession` needs. */
export interface ClaimedGuestContact {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

/**
 * Let a registration CLAIM the record a guest checkout left behind.
 *
 * This is the other half of the card, and without it the feature locks people
 * out. Registration refuses any address that already holds an accountless row on
 * this channel (`isEmailAvailableForChannel`), so the moment checkout starts
 * creating those rows, "order as a guest, then create an account with the same
 * address" would dead-end on "If you already have an account, please sign in" —
 * and the sign-in behind that sentence would fail too, because the row has no
 * password. Claiming makes the shopper's second visit work exactly as it did
 * before this card, which is the bar a new record has to clear.
 *
 * WHAT IT WILL AND WILL NOT TAKE OVER. Only a row that is accountless on this
 * channel, was created BY a guest checkout, has never held a password, and has
 * never had its inbox proven. That last clause is the one that matters: a Google
 * sign-in stamps `email_verified` on whatever row it lands on, so once a person
 * has signed in with Google their row can no longer be taken over with a typed
 * password. Account-linked (B2B) contacts are outside the WHERE clause entirely,
 * so the activation-email path stays the only way into one.
 *
 * It grants no visibility that registering did not already grant: the storefront
 * account area has always surfaced guest orders placed under your own address,
 * and claiming the row is how that keeps working now the order carries a contact
 * id instead of a NULL.
 *
 * Returns null when there is nothing claimable, and the caller then returns the
 * same neutral refusal it always did — so from outside, an address with a guest
 * record and an address with none are still indistinguishable.
 */
export async function claimGuestCheckoutContact(input: {
  email: string;
  passwordHash: string;
  firstName?: string | null;
  lastName?: string | null;
  metafields?: Record<string, unknown>;
}): Promise<ClaimedGuestContact | null> {
  const email = normaliseContactEmail(input.email);
  if (!email || !input.passwordHash) return null;
  const sql = getCommerceClient();
  if (!sql) return null;

  const firstName = (input.firstName ?? "").trim() || null;
  const lastName = (input.lastName ?? "").trim() || null;

  try {
    const [row] = await sql<ClaimedGuestContact[]>`
      UPDATE contacts
      SET password_hash = ${input.passwordHash},
          first_name = coalesce(${firstName}, first_name),
          last_name  = coalesce(${lastName}, last_name),
          is_active = true,
          metafields = coalesce(metafields, '{}'::jsonb) || ${asJsonText(input.metafields ?? {})}::jsonb,
          updated_at = now()
      WHERE account_id IS NULL
        AND coalesce(origin_channel_id, 0) = ${CHANNEL_ID}
        AND lower(email) = ${email}
        AND password_hash IS NULL
        AND metafields->>${GUEST_CHECKOUT_MARKER} = 'true'
        AND coalesce(metafields->>'email_verified', 'false') <> 'true'
      RETURNING id, email, first_name, last_name`;
    return row ?? null;
  } catch (e) {
    console.error("[claimGuestCheckoutContact] failed (non-fatal):", e);
    return null;
  }
}
