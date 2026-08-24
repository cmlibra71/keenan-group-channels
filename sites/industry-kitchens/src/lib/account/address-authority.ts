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
// checkout over a detail. Nor does THIS module refuse an ORDER.
//
// Accountless (B2C) shoppers have no membership, so `isB2B` is false and they
// bypass all of this — a B2C person is their own manager.
//
// ── KNOWN CONFLICT, reported not hidden (surface sf-checkout) ────────────────
// `placeOrder` carries a SEPARATE, older gate owned by the role-enforcement work
// (docs/crm-parity/10-role-enforcement.md rows 9/10): a contact denied
// `add_billing_address_in_checkout` / `add_shipping_address_in_checkout` has
// their ORDER refused unless the typed address is ALREADY saved on the account.
// On production (2026-08-24) all 310 memberships this card refuses sit on
// accounts with ZERO `customer_addresses`, and 309 of them are denied those two
// checkout codes outright — so once the book's Add is gone they have no
// self-serve way to put an address anywhere, and no way to place a storefront
// order. Both rules are individually right; together they close the door.
//
// We keep the refusal (it is what the card asks for and what Zoey does — Zoey
// treats `add_bill_to_address` as main-contact-only too) and we do NOT widen the
// checkout gate, because widening it would be the "gate on selection" the
// Product Brief forbids in reverse: a junior buyer could redirect deliveries to
// an address nobody approved, which is the exact risk this card exists to close.
// What we owe them instead is a route that is REAL and wording that is TRUE:
// every refusal on both surfaces now names the remedy (contact us) and never
// tells them to do something the next screen refuses.
//
// The ROOT cause is a separate Zoey parity gap that no card owns yet: Zoey's own
// ship-to list lives in `account_locations` (20,539 rows across 19,864 accounts —
// every one of the 135 refused accounts has some), and this storefront's checkout
// reads only `customer_addresses`. Offer the account's locations at checkout and
// the dead end disappears without loosening anything. Recorded on card H5JdsMrC
// and in docs/behaviour/checkout-freight.md.
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
  // No resolved account = nothing to file against and no role to read: fail open,
  // exactly as `placeOrder` does. Checked here (not inside the two predicates
  // below) so the early return cannot be lost in a refactor.
  if (!perms.isB2B || perms.accountId === null) return true;
  return mayTypeNewAddressAtCheckout(perms) && mayManageAddressBook(perms, "add");
}

/**
 * May this contact introduce a NEW (not-yet-saved) address while ordering?
 *
 * Zoey's two checkout codes, read exactly as `placeOrder` reads them — this is
 * the pre-existing gate that REFUSES THE ORDER (10-role-enforcement rows 9/10),
 * lifted out so the screens can ask the same question the order will ask.
 * Nothing here changes that gate; it exists so the address book can tell the
 * customer the truth about what happens next instead of guessing.
 */
export function mayTypeNewAddressAtCheckout(perms: AddressRolePermissions): boolean {
  if (!perms.isB2B || perms.accountId === null) return true;
  return (
    perms.can("add_billing_address_in_checkout") && perms.can("add_shipping_address_in_checkout")
  );
}

/**
 * What a refused customer is told. Plain, names the action they tried, and points
 * at the person who can do it — never a bare refusal.
 */
export function addressAuthorityMessage(verb: "adding" | "editing" | "removing"): string {
  return `Your role on this account doesn't allow ${verb} addresses. Ask your account administrator.`;
}

// ── What a refused customer is TOLD in the address book ──────────────────────
//
// Three things this wording has to get right, and the first version of it got
// all three wrong:
//
//  1. The book is CONTACT-scoped, not account-scoped (`loadProfileAddresses`,
//     `customerAddressService.listForContact` and `deleteAddressForContact` all
//     key on `contact_id`). These are the person's OWN saved rows, so we must not
//     call them "your account's addresses".
//  2. There is nowhere on any storefront screen where the account's manager can
//     change a COLLEAGUE's saved address, so "ask your manager" is a dead end.
//     The refused customer is sent to us. On production every contact this
//     refuses is also their account's main contact or has no colleague who could
//     help — the 136 Billing and Shipping contacts ARE their account's main
//     contact, so "ask the manager" would have told them to ask themselves.
//  3. It must not promise a choice among nothing. Every contact this refuses has
//     ZERO saved addresses today, so the empty book IS the screen: the note has
//     to describe what they can still do, not offer them a list that is not there.
//  4. And — the one the second review caught — it must not promise something the
//     NEXT screen refuses. "You can still type a delivery address as you order"
//     is false for 309 of the 310 memberships this card refuses, because their
//     role is also denied `add_*_address_in_checkout` and `placeOrder` turns that
//     order away. Whether that sentence is true is not a guess we may make from
//     the book alone, so the page hands in the two facts that decide it:
//     `canTypeAddressAtCheckout` and `accountHasSavedAddresses`. Every branch
//     below is a sentence we can stand behind on the next screen.
//
// It is also printed whenever ANY of the three writes is refused, not only when
// all three are — a role that may add but not edit would otherwise lose Edit,
// Delete and Set-as-default with no explanation at all.

/** The verb each refused action is described with, in the order they read. */
const REFUSED_VERBS: readonly [keyof AddressBookPermissions, string][] = [
  ["canAdd", "adding"],
  ["canEdit", "changing"],
  ["canRemove", "removing"],
];

export interface AddressBookPermissions {
  canAdd: boolean;
  canEdit: boolean;
  canRemove: boolean;
}

export interface AddressBookNoticeInput extends AddressBookPermissions {
  /** Does THIS contact have any saved address in this book right now? */
  hasSavedAddresses: boolean;
  /**
   * May they type a brand-new address while ordering — i.e. would `placeOrder`
   * accept it? `mayTypeNewAddressAtCheckout`. Defaults to true so a B2C caller
   * (which never reaches these lines anyway) reads unchanged.
   */
  canTypeAddressAtCheckout?: boolean;
}

function joinVerbs(verbs: readonly string[]): string {
  if (verbs.length <= 1) return verbs[0] ?? "";
  return `${verbs.slice(0, -1).join(", ")} or ${verbs[verbs.length - 1]}`;
}

/**
 * The sentences the Address Book prints in place of the controls it hides, or
 * `null` when nothing is refused and the book behaves normally.
 *
 * The component renders one more line after these, carrying the "contact us"
 * link — the "somewhere to go" every refusal on this surface owes the customer.
 */
export function addressBookNoticeLines(input: AddressBookNoticeInput): string[] | null {
  const refused = REFUSED_VERBS.filter(([key]) => !input[key]).map(([, verb]) => verb);
  if (refused.length === 0) return null;

  const lines = [
    `Your role on this account doesn't allow ${joinVerbs(refused)} saved addresses.`,
  ];
  const canType = input.canTypeAddressAtCheckout ?? true;

  if (input.hasSavedAddresses) {
    // The checkout's picker is CONTACT-scoped (`customerAddressService.listForContact`),
    // so "the addresses below" and "what you can choose at checkout" are the same
    // list. That is the only reason this sentence is safe to print.
    lines.push("You can still choose any of the addresses below whenever you order.");
  } else if (input.canAdd) {
    // They may still add one here, so the book itself is the way out.
  } else if (canType) {
    lines.push("You can still type a delivery address as you order — it just isn't saved here.");
  } else {
    // The dead end, said plainly. No route through the site exists for this
    // person today, so we must not invent one: the contact-us line the component
    // prints underneath is the whole remedy, and it is a real one — staff file the
    // address and everything works from there.
    //
    // Note we do NOT soften this when a COLLEAGUE has an address on the account.
    // `placeOrder`'s gate is account-wide, so typing that colleague's address
    // verbatim would in fact be accepted — but the checkout only ever OFFERS this
    // contact's own rows, so there is no screen on which they could choose or even
    // read it. Telling them to pick from a list they are not shown is the same
    // failure as the sentence this replaced.
    lines.push(
      "There's no delivery address saved to your profile, and your role can't add one while you order — so we'll need to add it for you before an order can go through."
    );
  }
  return lines;
}
