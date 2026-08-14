// ============================================================================
// Account roles, in plain language, for the customer's own account screen.
//
// These are the B2B ACCOUNT roles (`account_roles`, Zoey's own vocabulary —
// Manager, Billing, Shipping, Buyer, …) that a person holds on a company
// account via `account_memberships.role_id`. They are NOT the portal's staff
// RBAC. `role-permissions.ts` next door decides what a role may DO at runtime;
// this module turns the same stored permissions into sentences a customer can
// read, which is what card 8LfB0DZS asked for:
//
//   "Defined roles in the drop down should have an explanation on what access
//    those roles have … It is very important to show roles that have access to
//    Credit Card payments or Authorised to make an order on behalf of the
//    Business/Company."  (Steve, card 8LfB0DZS)
//
// Pure: no DB, no channel. Unit-tested in account-roles.test.ts.
// ============================================================================

// Relative, not "@/": this module is unit-tested directly with node:test + tsx,
// which does not resolve the Next path alias.
import { decidePermission, parseRolePermissions } from "../role-permissions";

/** A row out of `account_roles`. */
export interface AccountRoleRow {
  id: number;
  name: string;
  description?: string | null;
  permissions?: unknown;
  scope?: string | null;
}

/** A role as the customer sees it: a name, a sentence, and the two flags Steve asked to be explicit. */
export interface AccountRoleOption {
  id: number;
  name: string;
  /** One short line for the dropdown help text. */
  summary: string;
  /** The full plain-language breakdown, one line per capability. */
  details: string[];
  /**
   * Tim's Manager/Billing rule for SETTLING THE ACCOUNT'S INVOICES by card
   * (see CARD_PAYMENT_ROLE_NAMES). It is NOT "may use a card anywhere":
   * paying at the checkout is a different, wider entitlement — see
   * `canPayByCardAtCheckout`.
   */
  canPayByCard: boolean;
  /**
   * Zoey `use_company_card_in_checkout` — may pay by card during checkout,
   * which every live role holds. Kept separate from `canPayByCard` because the
   * two gates genuinely differ and one sentence covering both is untrue for
   * five of the six live roles.
   */
  canPayByCardAtCheckout: boolean;
  /** Zoey `submit_orders` — may place an order on behalf of the business. */
  canOrderForBusiness: boolean;
  /** Zoey `convert_quotes_to_order_require_approval` — their orders wait for a manager. */
  ordersNeedApproval: boolean;
  /** Zoey `view_company_orders` — sees the whole account's orders, not only their own. */
  seesAllOrders: boolean;
  /** Zoey `add_contact` + `edit_contact` — may manage the people on the account. */
  managesPeople: boolean;
}

/**
 * The roles that may SETTLE THE ACCOUNT'S INVOICES by card.
 *
 * Tim, card Sh03niVC (2026-08-10): "Only people who are authorised can make the
 * payment. The only people that can should have the role of 'Manager' or
 * 'Billing' on the account."
 *
 * Deliberately NOT derived from Zoey's `use_company_card_in_checkout`, which
 * Shipping, Buyer and Restricted Buyer all hold too: that code is about using a
 * saved company card during checkout, not about settling money owing on an
 * account.
 *
 * ⚠️ SCOPE, and it matters. There are THREE card-payment paths on the
 * storefront and they do not share a gate (production role data, 2026-08-14):
 *
 *   1. Paying at the CHECKOUT — `placeOrder` gates on `submit_orders` only, and
 *      all six live roles grant `use_company_card_in_checkout`. Every role can
 *      do this. Printed from `canPayByCardAtCheckout`, never from this list.
 *   2. Paying a QUOTE — `lib/actions/quote-payment.ts` gates on `approve_quotes`
 *      + `convert_company_quotes_to_order` (card 0Wy0xHuq: paying a quote IS
 *      accepting it). Billing DENIES both, so Billing cannot pay a quote today.
 *   3. Settling an outstanding ORDER balance — Tim's ruling above, i.e. THIS
 *      list. Card Sh03niVC, not built yet.
 *
 * So this list governs (3) alone, and every sentence derived from it says
 * "invoices"/"balance owing", never a bare "credit card". Widening it back into
 * a blanket statement is the defect this comment exists to stop: it told a
 * Billing contact they could pay while the live quote path refused them, and
 * told a Buyer they could not pay while the checkout took their card.
 * The (2)/(3) disagreement is recorded on card 8LfB0DZS and in the
 * `sf-account-quotes` register entry — it is a real conflict, not a bug here.
 */
export const CARD_PAYMENT_ROLE_NAMES: readonly string[] = ["Manager", "Billing"];

export function roleCanPayByCard(roleName: string | null | undefined): boolean {
  if (!roleName) return false;
  const name = roleName.trim().toLowerCase();
  return CARD_PAYMENT_ROLE_NAMES.some((r) => r.toLowerCase() === name);
}

/**
 * Deprecated / legacy roles are hidden from every picker (JE8yQnmK, Steve
 * 2026-08-09). Live data names them by convention — "(Deprecated) Account
 * Admin", "(Legacy Account Role)" — so the leading bracket is the marker.
 * A person already ON such a role keeps it; it is only never OFFERED.
 */
export function isRetiredAccountRole(name: string | null | undefined): boolean {
  return /^\s*\(/.test(name ?? "");
}

/**
 * Which whole-account document emails this role actually RECEIVES, in plain words.
 *
 * Deliberately only the two document types something in the codebase really
 * sends (verified 2026-08-14): order confirmations, fanned out by
 * `lib/actions/checkout.ts` via `resolveAccountEmailRecipients({doc:"orders"})`,
 * and shipment/tracking mail, fanned out by the portal's `src/lib/shipment-email.ts`.
 *
 * The other `receive_email_for_*` codes Zoey stores — invoices, bills, credit
 * notes, quotes — have NO sender wired to them on either side. They were listed
 * here once and that was a promise the system does not keep. Add a label back
 * here only when you have added the sender that honours it.
 */
function accountEmailLines(can: (code: string) => boolean): string[] {
  const docs: Array<[string, string]> = [
    ["receive_email_for_company_orders", "order confirmations"],
    ["receive_email_for_company_order_shipments", "delivery updates"],
  ];
  const got = docs.filter(([code]) => can(code)).map(([, label]) => label);
  if (got.length === 0) return [];
  return [`Gets the account's ${got.join(" and ")} by email`];
}

/**
 * May this role add and remove the people on the account?
 *
 * Semantics: an EXPLICIT grant or deny always wins; the role's scope only picks
 * the default for a code that is ABSENT. That ordering is the whole point —
 * `decidePermission` defaults an absent action code to ALLOW so a missing key
 * can never brick checkout, and reading that default back as authority over a
 * shared account list is how the previous build got both of these wrong on live
 * data (production, 2026-08-14):
 *
 *   - "(Legacy Account Role)" (10 live memberships): scope NULL, permissions
 *     `["view_company_orders"]` — no add/edit key at all. Scope-alone said YES
 *     and let it rewrite the account's list. Absent + non-main scope now says NO.
 *   - "(Deprecated) Account Admin" (1 live membership): scope `additional`, but
 *     add_contact AND edit_contact are EXPLICITLY granted. Scope-alone said NO.
 *     An explicit grant now wins over the scope default.
 *
 * Billing and Shipping (scope `main`) explicitly DENY both codes in production
 * and stay refused, which is Zoey's own behaviour.
 */
export function roleManagesPeople(row: AccountRoleRow): boolean {
  const parsed = parseRolePermissions(row.permissions);
  const explicit = (code: string): boolean | null =>
    parsed.denies.has(code) ? false : parsed.grants.has(code) ? true : null;

  const add = explicit("add_contact");
  const edit = explicit("edit_contact");
  if (add === false || edit === false) return false; // an explicit deny always wins
  if (add === true && edit === true) return true; // an explicit grant always wins
  // At least one code is absent: the scope decides the default, and only a role
  // Zoey marks as a MAIN-contact role gets the benefit of the doubt. An unknown
  // or null scope is not a main-contact role.
  return row.scope === "main";
}

/** Turn a stored role row into the plain-language option the account screen shows. */
export function describeAccountRole(row: AccountRoleRow): AccountRoleOption {
  const parsed = parseRolePermissions(row.permissions);
  const can = (code: string) => decidePermission(code, parsed);

  const canOrderForBusiness = can("submit_orders");
  const ordersNeedApproval = can("convert_quotes_to_order_require_approval");
  const seesAllOrders = can("view_company_orders");
  const canPayByCard = roleCanPayByCard(row.name);
  const canPayByCardAtCheckout = canOrderForBusiness && can("use_company_card_in_checkout");
  const managesPeople = roleManagesPeople(row);

  const ordering = !canOrderForBusiness
    ? "Cannot place orders for the business"
    : ordersNeedApproval
      ? "Can place orders for the business, but a manager has to approve them first"
      : "Can place orders on behalf of the business";

  // Two sentences, because there are two different entitlements and one blanket
  // "can/cannot pay by credit card" is untrue for five of the six live roles.
  // See CARD_PAYMENT_ROLE_NAMES for the three paths and which gate owns each.
  const settling = canPayByCard
    ? "Authorised to settle the account's invoices by card"
    : "Not authorised to settle the account's invoices by card";
  const atCheckout = canPayByCardAtCheckout
    ? ["Can pay by card at the checkout, where the site offers it"]
    : [];

  const details = [
    ordering,
    settling,
    ...atCheckout,
    seesAllOrders
      ? "Can see every order on the account"
      : "Can only see their own orders",
    // Addresses and saved cards are deliberately NOT claimed here. Saved cards
    // belong to the person and live in Stripe (card TdTuvgQq, Tim 7-Aug) and the
    // storefront account area has no saved-card screen at all, so promising it
    // to a Manager is a claim the site cannot honour.
    ...(managesPeople ? ["Can add and remove the people on this account"] : []),
    ...accountEmailLines(can),
  ];

  return {
    id: row.id,
    name: row.name,
    summary: `${ordering}. ${settling}.`,
    details,
    canPayByCard,
    canPayByCardAtCheckout,
    canOrderForBusiness,
    ordersNeedApproval,
    seesAllOrders,
    managesPeople,
  };
}

/** The pickable roles, deprecated/legacy hidden, in a stable order. */
export function selectableAccountRoles(rows: AccountRoleRow[]): AccountRoleOption[] {
  return rows
    .filter((r) => !isRetiredAccountRole(r.name))
    .map(describeAccountRole)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Is this role the one that runs the account? Used to find who to notify. */
export function isManagerRole(roleName: string | null | undefined): boolean {
  return (roleName ?? "").trim().toLowerCase() === "manager";
}
