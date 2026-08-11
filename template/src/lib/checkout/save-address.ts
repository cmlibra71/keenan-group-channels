// ============================================================================
// "Save this address for next time" — the PURE decisions.
//
// Checkout may add the address a shopper just typed to their address book. Two
// judgements have to be made, and both are pure, so they live here (and are
// unit-tested) rather than inside the placeOrder side-effect:
//
//  1. Is this address ALREADY in the book?  A shopper who types out the address
//     they already have saved must not end up with two identical rows. The
//     comparison key is address1 + postcode, normalised exactly the way
//     `accountHasSavedAddress` (role-permissions.ts) normalises them, so "an
//     address we already know" means the same thing in the permission gate and
//     in the save path.
//
//  2. Should the new row become the default?  Spec (Steve, 2026-08-10 +
//     2026-08-11): a newly saved address must NEVER displace an existing
//     default. So it is default ONLY when it is the customer's first saved
//     address. This guard matters — `createAddressForContact` clears the
//     contact's other defaults BEFORE inserting, so passing isDefault* = true
//     for a later address would silently wipe the default they chose.
// ============================================================================

/** Normalised comparison key for an address: lowercased, whitespace-collapsed. */
export function addressKey(address1: string, postalCode: string): string {
  const norm = (s: string) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  return `${norm(address1)}|${norm(postalCode)}`;
}

/** Rows as read back from customer_addresses (snake_case, nullable columns). */
export interface ExistingAddressRow {
  address1: string | null;
  postal_code: string | null;
}

/** True when `key` matches an address the contact has already saved. */
export function isDuplicateAddress(key: string, existing: ExistingAddressRow[]): boolean {
  return existing.some((r) => addressKey(r.address1 ?? "", r.postal_code ?? "") === key);
}

export interface NewAddressDefaults {
  isDefaultBilling: boolean;
  isDefaultShipping: boolean;
}

/**
 * Default flags for an address about to be saved. The FIRST address a customer
 * saves becomes their default billing + shipping; every later one is saved
 * without touching the default they already have.
 */
export function defaultsForNewAddress(existingCount: number): NewAddressDefaults {
  const first = existingCount === 0;
  return { isDefaultBilling: first, isDefaultShipping: first };
}
