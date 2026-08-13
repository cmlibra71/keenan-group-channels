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
  /** Tim's Manager/Billing card-payment rule (see CARD_PAYMENT_ROLE_NAMES). */
  canPayByCard: boolean;
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
 * The roles that may make CARD PAYMENTS on an account.
 *
 * Tim, card Sh03niVC (2026-08-10): "Only people who are authorised can make the
 * payment. The only people that can should have the role of 'Manager' or
 * 'Billing' on the account."
 *
 * Deliberately NOT derived from Zoey's `use_company_card_in_checkout`, which
 * Shipping, Buyer and Restricted Buyer all hold too: that code is about using a
 * saved company card during checkout, not about settling money owing on an
 * account. Keeping ONE list here means the explanation this screen prints and
 * the gate the pay-an-outstanding-balance build applies cannot drift apart.
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

/** Which whole-account document emails this role subscribes to, in plain words. */
function accountEmailLines(can: (code: string) => boolean): string[] {
  const docs: Array<[string, string]> = [
    ["receive_email_for_company_orders", "order confirmations"],
    ["receive_email_for_company_order_invoices", "invoices"],
    ["receive_email_for_company_order_bills", "bills"],
    ["receive_email_for_company_order_shipments", "delivery and tracking updates"],
    ["receive_email_for_company_order_creditmemos", "credit notes"],
  ];
  const got = docs.filter(([code]) => can(code)).map(([, label]) => label);
  if (got.length === 0) return [];
  const list =
    got.length === 1 ? got[0] : `${got.slice(0, -1).join(", ")} and ${got[got.length - 1]}`;
  return [`Gets the account's ${list} by email`];
}

/** Turn a stored role row into the plain-language option the account screen shows. */
export function describeAccountRole(row: AccountRoleRow): AccountRoleOption {
  const parsed = parseRolePermissions(row.permissions);
  const can = (code: string) => decidePermission(code, parsed);

  const canOrderForBusiness = can("submit_orders");
  const ordersNeedApproval = can("convert_quotes_to_order_require_approval");
  const seesAllOrders = can("view_company_orders");
  const canPayByCard = roleCanPayByCard(row.name);

  // `add_contact`/`edit_contact` are two of Zoey's ELEVEN main-contact-only
  // permissions: its Additional Contact Role form has 34 checkboxes, not 45, so
  // an additional role simply has no such key — and an absent code defaults to
  // ALLOW in the enforcement resolver (deliberately: a missing key must never
  // brick checkout). Reading that default back as a SENTENCE would tell a Buyer
  // they can add and remove people and saved cards, which Zoey never let them
  // do. The role's own scope settles it.
  const managesPeople =
    row.scope !== "additional" && can("add_contact") && can("edit_contact");

  const ordering = !canOrderForBusiness
    ? "Cannot place orders for the business"
    : ordersNeedApproval
      ? "Can place orders for the business, but a manager has to approve them first"
      : "Can place orders on behalf of the business";

  const payment = canPayByCard
    ? "Can pay by credit card"
    : "Cannot pay by credit card";

  const details = [
    ordering,
    payment,
    seesAllOrders
      ? "Can see every order on the account"
      : "Can only see their own orders",
    ...(managesPeople ? ["Can add and remove people, addresses and saved cards"] : []),
    ...accountEmailLines(can),
  ];

  return {
    id: row.id,
    name: row.name,
    summary: `${ordering}. ${payment}.`,
    details,
    canPayByCard,
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
