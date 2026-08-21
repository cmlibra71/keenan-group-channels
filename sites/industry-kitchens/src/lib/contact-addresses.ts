// ============================================================================
// Contact-keyed address CRUD (identity unification).
//
// customer_addresses rows are owned by EITHER a legacy customer_id or a
// contact_id (one-of, DB CHECK). Reads go through
// customerAddressService.listForContact (legacy rows carry contact_id from the
// migration backfill), but the service's WRITE paths are still nested under the
// customers table (createForParent/updateForParent validate a customers parent
// and key their default-flag clearing on customer_id) — unusable for a
// contact-subject session. These raw postgres.js helpers are the contact-keyed
// write path: every mutation is guarded by `AND contact_id = <owner>` in the
// statement itself, and default billing/shipping stays exclusive per contact.
// ============================================================================

import { getCommerceClient } from "@keenan/services";
import {
  addressKey,
  isDuplicateAddress,
  defaultsForNewAddress,
  type ExistingAddressRow,
} from "@/lib/checkout/save-address";

export type ContactAddressData = {
  firstName: string;
  lastName: string;
  company: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  stateOrProvince: string;
  postalCode: string;
  country: string;
  countryCode: string;
  isDefaultBilling: boolean;
  isDefaultShipping: boolean;
};

function client() {
  const sql = getCommerceClient();
  if (!sql) throw new Error("Commerce database is not initialised.");
  return sql;
}

/** Clear default flags on the contact's OTHER addresses so defaults stay exclusive. */
async function clearDefaults(
  contactId: number,
  opts: { billing?: boolean; shipping?: boolean; exceptId?: number }
): Promise<void> {
  const sql = client();
  if (opts.billing) {
    await sql`
      UPDATE customer_addresses SET is_default_billing = false
      WHERE contact_id = ${contactId}
        AND (${opts.exceptId ?? null}::int IS NULL OR id <> ${opts.exceptId ?? null})`;
  }
  if (opts.shipping) {
    await sql`
      UPDATE customer_addresses SET is_default_shipping = false
      WHERE contact_id = ${contactId}
        AND (${opts.exceptId ?? null}::int IS NULL OR id <> ${opts.exceptId ?? null})`;
  }
}

/**
 * How many addresses the contact already has. Used by the address book to give
 * a customer's FIRST address both default flags (card xqWftDcL) — the same rule
 * checkout's "save this address" path applies, so the two ways of getting an
 * address on file cannot disagree about what a first address means.
 */
export async function countAddressesForContact(contactId: number): Promise<number> {
  const sql = client();
  const rows = await sql<{ count: string }[]>`
    SELECT count(*)::text AS count FROM customer_addresses WHERE contact_id = ${contactId}`;
  return Number(rows[0]?.count ?? 0);
}

export async function createAddressForContact(
  contactId: number,
  d: ContactAddressData
): Promise<void> {
  const sql = client();
  await clearDefaults(contactId, { billing: d.isDefaultBilling, shipping: d.isDefaultShipping });
  await sql`
    INSERT INTO customer_addresses (
      contact_id, first_name, last_name, company, phone,
      address1, address2, city, state_or_province, postal_code,
      country, country_code, is_default_billing, is_default_shipping
    ) VALUES (
      ${contactId}, ${d.firstName}, ${d.lastName}, ${d.company}, ${d.phone},
      ${d.address1}, ${d.address2}, ${d.city}, ${d.stateOrProvince}, ${d.postalCode},
      ${d.country}, ${d.countryCode}, ${d.isDefaultBilling}, ${d.isDefaultShipping}
    )`;
}

/**
 * Add an address the shopper typed at CHECKOUT to their address book, when they
 * asked us to keep it ("Save this address for next time").
 *
 * Two rules, both from the pure `save-address` module so they are unit-tested:
 *   - an address they already have saved is not stored twice ("duplicate");
 *   - the new row is only made the default when it is their FIRST address, so a
 *     default they already chose is never displaced.
 *
 * Caller treats every outcome as advisory: an order must never fail because the
 * address book could not be updated.
 */
export async function saveCheckoutAddressForContact(
  contactId: number,
  d: Omit<ContactAddressData, "isDefaultBilling" | "isDefaultShipping">
): Promise<"saved" | "duplicate"> {
  const sql = client();
  const rows = await sql<ExistingAddressRow[]>`
    SELECT address1, postal_code FROM customer_addresses WHERE contact_id = ${contactId}`;
  if (isDuplicateAddress(addressKey(d.address1, d.postalCode), rows)) return "duplicate";
  await createAddressForContact(contactId, { ...d, ...defaultsForNewAddress(rows.length) });
  return "saved";
}

/** Full-field update. The WHERE clause is the ownership guard. */
export async function updateAddressForContact(
  contactId: number,
  id: number,
  d: ContactAddressData
): Promise<void> {
  const sql = client();
  await clearDefaults(contactId, {
    billing: d.isDefaultBilling,
    shipping: d.isDefaultShipping,
    exceptId: id,
  });
  const result = await sql`
    UPDATE customer_addresses SET
      first_name = ${d.firstName}, last_name = ${d.lastName}, company = ${d.company},
      phone = ${d.phone}, address1 = ${d.address1}, address2 = ${d.address2},
      city = ${d.city}, state_or_province = ${d.stateOrProvince}, postal_code = ${d.postalCode},
      country = ${d.country}, country_code = ${d.countryCode},
      is_default_billing = ${d.isDefaultBilling}, is_default_shipping = ${d.isDefaultShipping},
      updated_at = now()
    WHERE id = ${id} AND contact_id = ${contactId}`;
  if (result.count === 0) throw new Error("Address not found.");
}

export async function deleteAddressForContact(contactId: number, id: number): Promise<void> {
  const sql = client();
  const result = await sql`
    DELETE FROM customer_addresses WHERE id = ${id} AND contact_id = ${contactId}`;
  if (result.count === 0) throw new Error("Address not found.");
}

export async function setAddressDefaultForContact(
  contactId: number,
  id: number,
  type: "billing" | "shipping"
): Promise<void> {
  const sql = client();
  await clearDefaults(contactId, {
    billing: type === "billing",
    shipping: type === "shipping",
    exceptId: id,
  });
  const result =
    type === "billing"
      ? await sql`UPDATE customer_addresses SET is_default_billing = true, updated_at = now()
                  WHERE id = ${id} AND contact_id = ${contactId}`
      : await sql`UPDATE customer_addresses SET is_default_shipping = true, updated_at = now()
                  WHERE id = ${id} AND contact_id = ${contactId}`;
  if (result.count === 0) throw new Error("Address not found.");
}
