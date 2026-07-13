// ============================================================================
// B2B account-role permission enforcement (storefront side).
//
// `account_roles.permissions` (jsonb) carries Zoey's REAL role-permission codes
// (45 of them, captured from Zoey's live role editor — see the portal's
// `src/lib/account-roles/role-permissions.ts` for the full catalog and
// `docs/crm-parity/10-role-enforcement.md` for what is enforced where).
// A contact's role comes from their account membership
// (`account_memberships.role_id`); accountless contacts (B2C shoppers) have no
// membership and BYPASS role enforcement entirely.
//
// ── Stored shape ─────────────────────────────────────────────────────────────
// permissions is an ARRAY. String entries are GRANTED codes. At most one
// OBJECT entry carries the extras the portal role editor writes:
//   { "deny": string[],                       // codes explicitly unticked
//     "conditions": { "submit_orders": [      // Zoey's Conditions builder
//       { "type": "cart_total_lt" | "mtd_total_lt" | "ytd_total_lt",
//         "value": number } ] } }
// Legacy KGP-invented codes (view_orders, …) may linger as strings; they are
// not Zoey vocabulary and are ignored here.
//
// ── Decision semantics (documented in 10-role-enforcement.md) ────────────────
// For an ACTION code (submit_orders, view_company_orders, …):
//   1. explicitly denied  → false
//   2. explicitly granted → true
//   3. absent             → per-code default: ALLOW for every code EXCEPT
//      `submit_other_customer_orders` (deny). A missing key must never brick
//      checkout — Zoey's checkboxes default on for standard roles, and the
//      legacy→Zoey migration is lossy (it cannot reconstruct unticked boxes).
// GRANT-ONLY codes are not action gates and are false unless granted:
//   - the 19 `receive_email_for_*` codes (they SUBSCRIBE a contact to account
//     emails — defaulting them "allow" would email every contact everything);
//   - `convert_quotes_to_order_require_approval` (a RESTRICTION: ticked means
//     the contact's conversions need admin approval — absent means no
//     restriction).
//
// ── Failure policy ───────────────────────────────────────────────────────────
// The resolver FAILS OPEN: a DB hiccup returns a bypass context (isB2B=false)
// so checkout keeps working, but logs loudly. This is a deliberate,
// documented choice (10-role-enforcement.md §Fail-open).
// ============================================================================

import { getCommerceClient } from "@keenan/services";

// ── Types ────────────────────────────────────────────────────────────────────

export type RoleConditionType = "cart_total_lt" | "mtd_total_lt" | "ytd_total_lt";

export interface RoleCondition {
  type: RoleConditionType;
  value: number;
}

export interface ParsedRolePermissions {
  grants: Set<string>;
  denies: Set<string>;
  conditions: Record<string, RoleCondition[]>;
}

export interface ContactPermissions {
  /** True when the contact has an active account membership (B2B person). */
  isB2B: boolean;
  /** The primary account (is_default first, then main-contact, then oldest). */
  accountId: number | null;
  roleId: number | null;
  roleName: string | null;
  isMainContact: boolean;
  /** True when the DB lookup failed and we failed OPEN. */
  failedOpen: boolean;
  can(code: string): boolean;
  conditions(code: string): RoleCondition[];
}

/** Codes that default DENY when absent (everything else defaults allow). */
export const DEFAULT_DENY_CODES: ReadonlySet<string> = new Set([
  "submit_other_customer_orders",
]);

/**
 * Grant-only codes: never satisfied by the permissive default. Email codes are
 * recipient subscriptions; convert_quotes_to_order_require_approval is a
 * restriction flag (see header).
 */
export function isGrantOnlyCode(code: string): boolean {
  return (
    code.startsWith("receive_email_for_") ||
    code === "convert_quotes_to_order_require_approval"
  );
}

// ── Pure parsing + decision (unit-tested in role-permissions.test.ts) ────────

const CONDITION_TYPES: ReadonlySet<string> = new Set([
  "cart_total_lt",
  "mtd_total_lt",
  "ytd_total_lt",
]);

function parseConditions(raw: unknown): Record<string, RoleCondition[]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, RoleCondition[]> = {};
  for (const [code, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    const conds: RoleCondition[] = [];
    for (const entry of list) {
      if (!entry || typeof entry !== "object") continue;
      const { type, value } = entry as { type?: unknown; value?: unknown };
      const num = typeof value === "string" ? Number(value) : value;
      if (typeof type === "string" && CONDITION_TYPES.has(type) && typeof num === "number" && Number.isFinite(num)) {
        conds.push({ type: type as RoleConditionType, value: num });
      }
    }
    if (conds.length > 0) out[code] = conds;
  }
  return out;
}

/** Normalise the permissions jsonb (mixed string/object array) — never throws. */
export function parseRolePermissions(raw: unknown): ParsedRolePermissions {
  const grants = new Set<string>();
  const denies = new Set<string>();
  let conditions: Record<string, RoleCondition[]> = {};
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry === "string") {
        grants.add(entry);
      } else if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        const meta = entry as { deny?: unknown; conditions?: unknown };
        if (Array.isArray(meta.deny)) {
          for (const d of meta.deny) if (typeof d === "string") denies.add(d);
        }
        conditions = { ...conditions, ...parseConditions(meta.conditions) };
      }
    }
  }
  // A grant beats a stale deny of the same code (an explicit tick is newest intent).
  for (const g of grants) denies.delete(g);
  return { grants, denies, conditions };
}

/**
 * The decision function. `parsed` is null when the contact's role is missing
 * or unparseable — the permissive defaults then apply unmodified.
 */
export function decidePermission(
  code: string,
  parsed: ParsedRolePermissions | null
): boolean {
  if (isGrantOnlyCode(code)) return parsed?.grants.has(code) ?? false;
  if (parsed) {
    if (parsed.denies.has(code)) return false;
    if (parsed.grants.has(code)) return true;
  }
  return !DEFAULT_DENY_CODES.has(code);
}

// ── submit_orders Conditions evaluation (pure) ───────────────────────────────

export interface OrderConditionTotals {
  /** The current cart total, GST-inclusive (matches Zoey's "Cart Total"). */
  cartTotal: number;
  /** Contact's month-to-date order total; null when the lookup failed (skip = fail open). */
  mtdTotal: number | null;
  /** Contact's year-to-date order total; null when the lookup failed (skip = fail open). */
  ytdTotal: number | null;
}

/**
 * Zoey semantics: "Allow submit orders IF <total> is less than <value>". Every
 * condition must pass (AND). A null MTD/YTD total (lookup failure) skips that
 * condition — fail open, logged by the caller.
 * Returns the first failing condition, or null when all pass.
 */
export function firstFailedOrderCondition(
  conditions: RoleCondition[],
  totals: OrderConditionTotals
): RoleCondition | null {
  for (const cond of conditions) {
    const actual =
      cond.type === "cart_total_lt"
        ? totals.cartTotal
        : cond.type === "mtd_total_lt"
          ? totals.mtdTotal
          : totals.ytdTotal;
    if (actual === null) continue; // lookup failed → fail open on this condition
    if (!(actual < cond.value)) return cond;
  }
  return null;
}

export function describeFailedCondition(cond: RoleCondition): string {
  const limit = `$${cond.value.toFixed(2)}`;
  switch (cond.type) {
    case "cart_total_lt":
      return `your role only allows orders under ${limit}`;
    case "mtd_total_lt":
      return `your role only allows ordering while your month-to-date order total is under ${limit}`;
    case "ytd_total_lt":
      return `your role only allows ordering while your year-to-date order total is under ${limit}`;
  }
}

// ── Account email recipient resolution (pure part) ───────────────────────────

/** Document types carried by Zoey's email permission triples. */
export type AccountEmailDocType =
  | "orders"
  | "order_bills"
  | "order_invoices"
  | "order_shipments"
  | "order_creditmemos"
  | "quotes";

export function emailPermissionCodes(doc: AccountEmailDocType): {
  company: string;
  own: string;
  cc: string;
} {
  return {
    company: `receive_email_for_company_${doc}`,
    own: `receive_email_for_own_company_${doc}`,
    cc: `receive_email_for_company_${doc}_as_cc`,
  };
}

export interface AccountEmailMemberRow {
  contact_id: number;
  email: string | null;
  permissions: unknown; // raw jsonb from the membership's role
}

/**
 * Given the account's members (+ their role permissions), work out who ELSE
 * should receive a document email beyond the purchaser:
 *   - `receive_email_for_company_<doc>`      → To, for EVERY account document
 *   - `receive_email_for_own_company_<doc>`  → To, only for the member's OWN documents
 *   - `receive_email_for_company_<doc>_as_cc`→ CC, for every account document
 * The purchaser's own address is excluded (they already get the primary email)
 * and results are de-duplicated case-insensitively, To winning over CC.
 * These codes are GRANT-ONLY: no grant, no email (see header).
 */
export function resolveEmailRecipientsFromRows(
  rows: AccountEmailMemberRow[],
  opts: {
    doc: AccountEmailDocType;
    /** Contact the document belongs to (order/quote owner); null for guest docs. */
    ownerContactId: number | null;
    /** Address already receiving the primary email (excluded from the extras). */
    primaryEmail: string | null;
  }
): { to: string[]; cc: string[] } {
  const codes = emailPermissionCodes(opts.doc);
  const primary = opts.primaryEmail?.trim().toLowerCase() || null;
  const to = new Map<string, string>();
  const cc = new Map<string, string>();
  for (const row of rows) {
    const email = row.email?.trim();
    if (!email) continue;
    const key = email.toLowerCase();
    if (primary && key === primary) continue;
    const parsed = parseRolePermissions(row.permissions);
    const isOwner = opts.ownerContactId !== null && row.contact_id === opts.ownerContactId;
    if (parsed.grants.has(codes.company) || (isOwner && parsed.grants.has(codes.own))) {
      to.set(key, email);
    } else if (parsed.grants.has(codes.cc)) {
      cc.set(key, email);
    }
  }
  for (const key of to.keys()) cc.delete(key);
  return { to: [...to.values()], cc: [...cc.values()] };
}

// ── DB-backed resolvers (fail OPEN, log loudly) ──────────────────────────────

const BYPASS: Omit<ContactPermissions, "failedOpen"> = {
  isB2B: false,
  accountId: null,
  roleId: null,
  roleName: null,
  isMainContact: false,
  can: () => true,
  conditions: () => [],
};

function buildContext(
  row: {
    account_id: number;
    role_id: number | null;
    role_name: string | null;
    is_main_contact: boolean;
    permissions: unknown;
  } | null,
  failedOpen: boolean
): ContactPermissions {
  if (!row) return { ...BYPASS, failedOpen };
  const parsed = row.role_id !== null ? parseRolePermissions(row.permissions) : null;
  return {
    isB2B: true,
    accountId: row.account_id,
    roleId: row.role_id,
    roleName: row.role_name,
    isMainContact: Boolean(row.is_main_contact),
    failedOpen,
    can: (code) => decidePermission(code, parsed),
    conditions: (code) => parsed?.conditions[code] ?? [],
  };
}

/**
 * THE shared resolver: the contact's effective B2B role permissions on their
 * primary account. Accountless contacts get a bypass context (isB2B=false,
 * can() always true). On DB failure we FAIL OPEN with a loud log — a resolver
 * hiccup must never brick checkout.
 */
export async function getContactPermissions(
  contactId: number | null | undefined
): Promise<ContactPermissions> {
  if (!contactId) return { ...BYPASS, failedOpen: false };
  try {
    const sql = getCommerceClient();
    if (!sql) throw new Error("Commerce database is not initialised.");
    const rows = await sql<
      {
        account_id: number;
        role_id: number | null;
        role_name: string | null;
        is_main_contact: boolean;
        permissions: unknown;
      }[]
    >`
      SELECT m.account_id, m.role_id, r.name AS role_name,
             m.is_main_contact, r.permissions
      FROM account_memberships m
      LEFT JOIN account_roles r ON r.id = m.role_id
      WHERE m.contact_id = ${contactId} AND m.status = 'active'
      ORDER BY m.is_default DESC, m.is_main_contact DESC, m.id ASC
      LIMIT 1`;
    return buildContext(rows[0] ?? null, false);
  } catch (e) {
    console.error(
      `[role-permissions] resolver FAILED for contact ${contactId} — FAILING OPEN (all permissions granted):`,
      e
    );
    return { ...BYPASS, failedOpen: true };
  }
}

/** Active member contact ids of an account (feeds view_company_orders/quotes). */
export async function getAccountContactIds(accountId: number): Promise<number[]> {
  try {
    const sql = getCommerceClient();
    if (!sql) throw new Error("Commerce database is not initialised.");
    const rows = await sql<{ contact_id: number }[]>`
      SELECT contact_id FROM account_memberships
      WHERE account_id = ${accountId} AND status = 'active'`;
    return rows.map((r) => Number(r.contact_id));
  } catch (e) {
    console.error(
      `[role-permissions] account contacts lookup FAILED for account ${accountId} — falling back to own-only view:`,
      e
    );
    return [];
  }
}

/**
 * Contact's order totals (GST-inc) since a point in time on a channel —
 * powers the MTD/YTD submit_orders conditions. Cancelled orders don't count.
 * Returns null on failure (caller fails open on that condition).
 */
export async function sumContactOrderTotalSince(
  contactId: number,
  channelId: number,
  since: Date
): Promise<number | null> {
  try {
    const sql = getCommerceClient();
    if (!sql) throw new Error("Commerce database is not initialised.");
    const rows = await sql<{ total: string | null }[]>`
      SELECT COALESCE(SUM(total_inc_tax), 0)::text AS total
      FROM orders
      WHERE contact_id = ${contactId}
        AND channel_id = ${channelId}
        AND status <> 'cancelled'
        AND created_at >= ${since.toISOString()}`;
    const n = Number(rows[0]?.total ?? 0);
    return Number.isFinite(n) ? n : null;
  } catch (e) {
    console.error(
      `[role-permissions] order-total lookup FAILED for contact ${contactId} — condition skipped (fail open):`,
      e
    );
    return null;
  }
}

/**
 * Does a typed checkout address match one already saved for the account's
 * members? Backs the add_*_address_in_checkout gates: a contact whose role
 * denies adding addresses in checkout must use a saved one. Match is
 * normalised on address line 1 + postal code (case/whitespace-insensitive).
 * Returns true (allow) on lookup failure — fail open, logged.
 */
export async function accountHasSavedAddress(
  accountId: number,
  address1: string,
  postalCode: string
): Promise<boolean> {
  try {
    const sql = getCommerceClient();
    if (!sql) throw new Error("Commerce database is not initialised.");
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
    const rows = await sql<{ address1: string | null; postal_code: string | null }[]>`
      SELECT ca.address1, ca.postal_code
      FROM customer_addresses ca
      JOIN account_memberships m ON m.contact_id = ca.contact_id
      WHERE m.account_id = ${accountId} AND m.status = 'active'`;
    const want1 = norm(address1);
    const wantPc = norm(postalCode);
    return rows.some(
      (r) => norm(r.address1 ?? "") === want1 && norm(r.postal_code ?? "") === wantPc
    );
  } catch (e) {
    console.error(
      `[role-permissions] saved-address lookup FAILED for account ${accountId} — FAILING OPEN:`,
      e
    );
    return true;
  }
}

/**
 * DB-backed wrapper over resolveEmailRecipientsFromRows: who else on the
 * account should get a document email. Fails CLOSED to “no extra recipients”
 * (an email fan-out is additive; a lookup failure just means only the primary
 * recipient is emailed).
 */
export async function resolveAccountEmailRecipients(
  accountId: number,
  opts: {
    doc: AccountEmailDocType;
    ownerContactId: number | null;
    primaryEmail: string | null;
  }
): Promise<{ to: string[]; cc: string[] }> {
  try {
    const sql = getCommerceClient();
    if (!sql) throw new Error("Commerce database is not initialised.");
    const rows = await sql<AccountEmailMemberRow[]>`
      SELECT m.contact_id, c.email, r.permissions
      FROM account_memberships m
      JOIN contacts c ON c.id = m.contact_id
      LEFT JOIN account_roles r ON r.id = m.role_id
      WHERE m.account_id = ${accountId}
        AND m.status = 'active'
        AND c.is_active IS NOT false`;
    return resolveEmailRecipientsFromRows(rows, opts);
  } catch (e) {
    console.error(
      `[role-permissions] email-recipient lookup FAILED for account ${accountId} — sending to primary recipient only:`,
      e
    );
    return { to: [], cc: [] };
  }
}
