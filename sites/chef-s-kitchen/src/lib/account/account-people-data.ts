// ============================================================================
// Server reads for the "People on the account" section (card 8LfB0DZS).
//
// Answers three of Steve's questions with data rather than words:
//   - who is on the account, and what access each of them has;
//   - who the account manager is (and, when there isn't one, says so — a
//     manager is NOT required for anyone else to be on the account);
//   - what the customer has told us about the other people we should contact.
//
// Every read fails soft: this section must never take the Account details page
// down. A failed lookup degrades to "no account" (the accountless shape), never
// to somebody else's account.
// ============================================================================

import { getCommerceClient } from "@keenan/services";
import { CHANNEL_ID } from "@/lib/channel";
import { getContactPermissions } from "@/lib/role-permissions";
import {
  describeAccountRole,
  selectableAccountRoles,
  isManagerRole,
  type AccountRoleOption,
  type AccountRoleRow,
} from "./account-roles";
import { normalisePeople, type AccountPerson } from "./account-people";

export interface AccountMemberView {
  contactId: number;
  name: string;
  email: string;
  phone: string;
  roleName: string;
  role: AccountRoleOption | null;
  isMainContact: boolean;
  isYou: boolean;
  /** High-level activity for the manager (card 8LfB0DZS); null when not shown. */
  activity: { orders: number; lastOrderAt: string | null } | null;
}

export interface AccountPeopleView {
  accountId: number | null;
  accountName: string | null;
  /** The account's manager, when one is set. */
  manager: { name: string; email: string; isYou: boolean } | null;
  members: AccountMemberView[];
  people: AccountPerson[];
  roles: AccountRoleOption[];
  /** May the signed-in person change the list? (Zoey add_contact/edit_contact) */
  canEdit: boolean;
  /** Why not, in one plain sentence, when canEdit is false. */
  cannotEditReason: string | null;
}

const EMPTY_ROLES: AccountRoleOption[] = [];

function fullName(first: unknown, last: unknown): string {
  return `${typeof first === "string" ? first : ""} ${typeof last === "string" ? last : ""}`.trim();
}

/** All pickable roles. Never throws — an empty list just hides the dropdown. */
export async function loadAccountRoles(): Promise<AccountRoleOption[]> {
  try {
    const sql = getCommerceClient();
    if (!sql) return EMPTY_ROLES;
    const rows = await sql<AccountRoleRow[]>`
      SELECT id, name, description, permissions, scope FROM account_roles`;
    return selectableAccountRoles(rows);
  } catch (e) {
    console.error("[account-people] role lookup failed — dropdown will be empty:", e);
    return EMPTY_ROLES;
  }
}

interface StoredPeopleSource {
  accountId: number | null;
  raw: unknown;
}

/**
 * Where this contact's people list lives, and what is in it.
 *
 * B2B → the ACCOUNT's metafields, so the manager and every colleague read the
 * same list (the old build wrote each person's list onto their OWN contact row,
 * which is exactly why nobody could see who was on the account). A list still
 * sitting on the contact is carried through when the account has none yet, so
 * nothing a customer typed disappears at the changeover.
 */
async function readStoredPeople(
  contactId: number,
  accountId: number | null
): Promise<StoredPeopleSource> {
  const sql = getCommerceClient();
  if (!sql) return { accountId, raw: [] };

  const contactRows = await sql<{ metafields: unknown }[]>`
    SELECT metafields FROM contacts WHERE id = ${contactId} LIMIT 1`;
  const contactList =
    (contactRows[0]?.metafields as Record<string, unknown> | null)?.account_contacts ?? [];

  if (accountId === null) return { accountId: null, raw: contactList };

  const accountRows = await sql<{ metafields: unknown }[]>`
    SELECT metafields FROM accounts WHERE id = ${accountId} LIMIT 1`;
  const accountList =
    (accountRows[0]?.metafields as Record<string, unknown> | null)?.account_contacts ?? [];

  const accountHas = Array.isArray(accountList) && accountList.length > 0;
  return { accountId, raw: accountHas ? accountList : contactList };
}

/** Everything the People section renders, for the signed-in contact. */
export async function loadAccountPeople(contactId: number): Promise<AccountPeopleView> {
  const roles = await loadAccountRoles();
  const roleIndex = roles.map((r) => ({ id: r.id, name: r.name }));

  const base: AccountPeopleView = {
    accountId: null,
    accountName: null,
    manager: null,
    members: [],
    people: [],
    roles,
    canEdit: true,
    cannotEditReason: null,
  };

  let perms;
  try {
    perms = await getContactPermissions(contactId);
  } catch {
    perms = null;
  }
  const accountId = perms?.isB2B ? perms.accountId : null;

  let stored: StoredPeopleSource = { accountId, raw: [] };
  try {
    stored = await readStoredPeople(contactId, accountId);
  } catch (e) {
    console.error("[account-people] stored people lookup failed:", e);
  }
  base.people = normalisePeople(stored.raw, roleIndex);

  if (accountId === null) return base;
  base.accountId = accountId;

  try {
    const sql = getCommerceClient();
    if (!sql) return base;

    const [accountRow] = await sql<{ name: string | null }[]>`
      SELECT name FROM accounts WHERE id = ${accountId} LIMIT 1`;
    base.accountName = accountRow?.name ?? null;

    const memberRows = await sql<
      {
        contact_id: number;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        phone: string | null;
        is_main_contact: boolean | null;
        role_id: number | null;
        role_name: string | null;
        description: string | null;
        permissions: unknown;
        scope: string | null;
      }[]
    >`
      SELECT m.contact_id, c.first_name, c.last_name, c.email, c.phone,
             m.is_main_contact, m.role_id, r.name AS role_name,
             r.description, r.permissions, r.scope
      FROM account_memberships m
      JOIN contacts c ON c.id = m.contact_id
      LEFT JOIN account_roles r ON r.id = m.role_id
      WHERE m.account_id = ${accountId}
        AND m.status = 'active'
        AND c.is_active IS NOT FALSE
      ORDER BY m.is_main_contact DESC, c.first_name ASC, c.id ASC`;

    // High-level activity, shown only to someone whose role lets them see the
    // account's orders — a count and a date, never money or line detail.
    let activity = new Map<number, { orders: number; lastOrderAt: string | null }>();
    if (perms?.can("view_company_orders") && memberRows.length > 0) {
      try {
        const ids = memberRows.map((m) => Number(m.contact_id));
        const rows = await sql<
          { contact_id: number; orders: string; last_order_at: string | null }[]
        >`
          SELECT contact_id, count(*)::text AS orders, max(created_at)::text AS last_order_at
          FROM orders
          WHERE channel_id = ${CHANNEL_ID}
            AND contact_id = ANY(${ids})
            AND status <> 'cancelled'
          GROUP BY contact_id`;
        activity = new Map(
          rows.map((r) => [
            Number(r.contact_id),
            { orders: Number(r.orders) || 0, lastOrderAt: r.last_order_at },
          ])
        );
      } catch (e) {
        console.error("[account-people] activity lookup failed — omitted:", e);
      }
    }

    base.members = memberRows.map((m) => {
      const id = Number(m.contact_id);
      return {
        contactId: id,
        name: fullName(m.first_name, m.last_name) || (m.email ?? ""),
        email: m.email ?? "",
        phone: m.phone ?? "",
        roleName: m.role_name ?? "",
        role:
          m.role_id !== null && m.role_name
            ? describeAccountRole({
                id: m.role_id,
                name: m.role_name,
                description: m.description,
                permissions: m.permissions,
                scope: m.scope,
              })
            : null,
        isMainContact: Boolean(m.is_main_contact),
        isYou: id === contactId,
        activity: activity.get(id) ?? (perms?.can("view_company_orders") ? { orders: 0, lastOrderAt: null } : null),
      };
    });

    const manager =
      base.members.find((m) => isManagerRole(m.roleName) && m.email) ??
      base.members.find((m) => isManagerRole(m.roleName)) ??
      null;
    base.manager = manager
      ? { name: manager.name, email: manager.email, isYou: manager.isYou }
      : null;

    // Who may CHANGE the list is decided by the same `managesPeople` reading the
    // screen prints, so what a role is TOLD it can do and what it may actually
    // do here cannot drift apart. Zoey gives this to the main-contact roles.
    // Everyone else still SEES the list; they just cannot edit it.
    const you = base.members.find((m) => m.isYou);
    if (you) {
      base.canEdit = you.role ? you.role.managesPeople : true;
      base.cannotEditReason = base.canEdit
        ? null
        : `Your role on this account (${you.roleName || "no role"}) doesn't allow changing who is on it. Ask your account manager${base.manager && !base.manager.isYou ? `, ${base.manager.name}` : ""}.`;
    }
  } catch (e) {
    console.error("[account-people] account lookup failed:", e);
  }

  return base;
}

/**
 * Who gets told that someone was added: the account's managers, minus the
 * person who did it (telling yourself what you just did is noise). An account
 * with NO manager falls back to its main contact — a manager is not required
 * for anyone else to be on the account, which is the question the card asks.
 * Returns [] when there is nobody else to tell, and the screen says so.
 */
export async function resolveAccountNotifyRecipients(
  accountId: number,
  actorContactId: number
): Promise<Array<{ name: string; email: string }>> {
  try {
    const sql = getCommerceClient();
    if (!sql) return [];
    const rows = await sql<
      {
        contact_id: number;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        role_name: string | null;
        is_main_contact: boolean | null;
      }[]
    >`
      SELECT m.contact_id, c.first_name, c.last_name, c.email,
             r.name AS role_name, m.is_main_contact
      FROM account_memberships m
      JOIN contacts c ON c.id = m.contact_id
      LEFT JOIN account_roles r ON r.id = m.role_id
      WHERE m.account_id = ${accountId}
        AND m.status = 'active'
        AND c.is_active IS NOT FALSE
        AND c.email IS NOT NULL`;

    const eligible = rows.filter((r) => Number(r.contact_id) !== actorContactId && r.email);
    const managers = eligible.filter((r) => isManagerRole(r.role_name));
    const chosen = managers.length > 0 ? managers : eligible.filter((r) => r.is_main_contact);

    const seen = new Set<string>();
    const out: Array<{ name: string; email: string }> = [];
    for (const r of chosen) {
      const email = (r.email ?? "").trim();
      const key = email.toLowerCase();
      if (!email || seen.has(key)) continue;
      seen.add(key);
      out.push({ name: fullName(r.first_name, r.last_name) || email, email });
    }
    return out;
  } catch (e) {
    console.error("[account-people] notify-recipient lookup failed:", e);
    return [];
  }
}
