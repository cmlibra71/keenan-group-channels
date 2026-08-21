/**
 * WHO on a business account may read the account's STATEMENT online (card k6pHXQBf).
 *
 * Tim, 2026-08-10: statements live in the account section, staff can email them, and the customer
 * can see their own. A statement is a company-wide money document — every invoice the business
 * owes us and what has been paid against them — so it is NOT for everyone with a login: a
 * Restricted Buyer who may place their own order has no business reading the company's debt.
 *
 * The pair is **Manager** and **Billing**, the same two roles Tim named on card Sh03niVC as the
 * people who settle the account's invoices. It is deliberately its OWN list rather than a reuse of
 * `CARD_PAYMENT_ROLE_NAMES`: those two rules are about the same people today, and widening one of
 * them later must not silently widen the other. Both names exist verbatim in `account_roles`.
 *
 * FAILS CLOSED. An unknown role, no role, no membership or a lookup that did not answer means no
 * statement — the same direction the pay-a-balance gate fails, and for the same reason: this is
 * somebody else's money.
 *
 * Pure — no DB, no session — so the rule is unit-tested.
 */

/** The account roles that may read the account's statement (Tim, k6pHXQBf + Sh03niVC). */
export const STATEMENT_ROLE_NAMES: readonly string[] = ["Manager", "Billing"];

export function roleSeesAccountStatement(roleName: string | null | undefined): boolean {
  if (!roleName) return false;
  const name = roleName.trim().toLowerCase();
  return STATEMENT_ROLE_NAMES.some((r) => r.toLowerCase() === name);
}

export interface StatementAccessInput {
  /** Does this person hold an active membership of a business account? */
  isB2B: boolean;
  accountId: number | null;
  /** Their role on THAT account. */
  roleName: string | null;
  /** True when the role lookup failed — treated as no. */
  lookupFailed?: boolean;
}

export type StatementAccess =
  | { visible: true; accountId: number }
  | { visible: false; reason: "no-account" | "role" | "unavailable" };

/**
 * The one decision, made once and used twice: the account menu shows the link only when this says
 * yes, and the page itself re-asks before it reads a figure. A gate enforced only in the menu is
 * not a gate.
 */
export function resolveStatementAccess(input: StatementAccessInput): StatementAccess {
  if (input.lookupFailed) return { visible: false, reason: "unavailable" };
  if (!input.isB2B || input.accountId == null) return { visible: false, reason: "no-account" };
  if (!roleSeesAccountStatement(input.roleName)) return { visible: false, reason: "role" };
  return { visible: true, accountId: input.accountId };
}

/** What a refused customer is told — plain, and never "you are not allowed" with no way forward. */
export function statementRefusalMessage(reason: "no-account" | "role" | "unavailable"): string {
  switch (reason) {
    case "no-account":
      return "Statements are for business accounts. Your orders and their payment details are in your order history.";
    case "role":
      return "Statements are available to the account's manager and billing contacts. Ask them, or contact us and we will send you a copy.";
    default:
      return "We couldn't load your statement just now. Please try again in a moment.";
  }
}
