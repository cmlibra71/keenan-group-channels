// ============================================================================
// WHO MAY CHANGE THE ADDRESSES SAVED ON A B2B ACCOUNT (card H5JdsMrC).
//
// Steve/Tim: "Customers other than the manager shall not be authorised to change
// delivery addresses."
//
// One address book serves both purposes on this storefront — a saved row is
// offered at checkout as the billing address AND as the delivery address, and the
// FIRST address a contact saves becomes their default billing and their default
// shipping both (`defaultsForNewAddress`, card 18PbOwaG). There is therefore no
// such thing here as a change that touches billing and leaves delivery alone, so
// every write into the book takes the BILL-TO code and the SHIP-TO code together.
// That is the same reading `placeOrder` already applies to Zoey's two
// `add_*_address_in_checkout` codes on this single-page checkout.
//
// What this deliberately does NOT gate: CHOOSING one of the addresses already
// saved on the account. A colleague who is not the manager still has to be able
// to receive goods, and the Product Brief forbids turning a customer away at
// checkout over a detail. Nor does it refuse an ORDER: a delivery address typed
// at checkout is used for that order, it is simply not filed in the book.
//
// Accountless (B2C) shoppers have no membership, so `isB2B` is false and they
// bypass all of this — a B2C person is their own manager.
// ============================================================================

export type AddressBookAction = "add" | "edit" | "remove";

/** The B2B role codes each write into the address book needs, BOTH of them. */
export const ADDRESS_BOOK_CODES: Record<AddressBookAction, readonly string[]> = {
  add: ["add_bill_to_address", "add_ship_to_address"],
  edit: ["edit_bill_to_address", "edit_ship_to_address"],
  remove: ["remove_bill_to_address", "remove_ship_to_address"],
};

/** The subset of a resolved permission context these decisions read. */
export interface AddressRolePermissions {
  isB2B: boolean;
  accountId: number | null;
  can(code: string): boolean;
}

/**
 * May this contact add / edit / remove addresses in the account address book?
 * Non-B2B contacts always may. The resolver fails OPEN on a DB error (it hands
 * back a non-B2B bypass context), which is the documented policy.
 */
export function mayManageAddressBook(
  perms: AddressRolePermissions,
  action: AddressBookAction
): boolean {
  if (!perms.isB2B) return true;
  return ADDRESS_BOOK_CODES[action].every((code) => perms.can(code));
}

/**
 * May a NEW address typed on the checkout — or on the storefront's quote-request
 * panel — be FILED in the account's address book?
 *
 * Two rules stacked, and they answer different questions. Zoey's
 * `add_billing_address_in_checkout` / `add_shipping_address_in_checkout` say
 * whether this role may introduce an address during checkout at all; the address
 * book's own add codes say whether they may change what the account has saved.
 * Filing does both, so it needs both. It is never a reason to refuse the order or
 * the quote — the save is best effort and the address is still used.
 */
export function mayFileAddressInBook(perms: AddressRolePermissions): boolean {
  if (!perms.isB2B || perms.accountId === null) return true;
  return (
    perms.can("add_billing_address_in_checkout") &&
    perms.can("add_shipping_address_in_checkout") &&
    mayManageAddressBook(perms, "add")
  );
}

/**
 * What a refused customer is told. Plain, names the action they tried, and points
 * at the person who can do it — never a bare refusal.
 */
export function addressAuthorityMessage(verb: "adding" | "editing" | "removing"): string {
  return `Your role on this account doesn't allow ${verb} addresses. Ask your account administrator.`;
}

/** The sentence the Address Book prints in place of its own controls. */
export const ADDRESS_BOOK_READ_ONLY_NOTE =
  "These are your account's saved addresses. Only the account's manager can add, change or remove them — ask them if one needs updating. You can still choose any of them when you order.";
