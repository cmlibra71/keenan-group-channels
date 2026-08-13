// ============================================================================
// Server reads for the "People on the account" section (card 8LfB0DZS).
//
// Answers three of Steve's questions with data rather than words:
//   - who is on the account, and what access each of them has;
//   - who the account manager is (and, when there isn't one, says so — a
//     manager is NOT required for anyone else to be on the account);
//   - what the customer has told us about the other people we should contact.
//
// SHAPE: two waves of parallel queries, not a chain of awaits. Speed is a
// stakeholder-visible feature (Tim, 7-Aug) and this section sits on the profile
// page, so it must not add seven serial round trips to it.
//   wave A — the role catalogue + the viewer's own permissions (independent)
//   wave B — the account row, the contact's legacy list, the members, and the
//            per-member activity (all four run together)
//
// FAILURE POLICY, and it differs by question:
//   - Reading fails SOFT: this section must never take the profile page down.
//   - Deciding who may EDIT fails CLOSED on a business account. The list is a
//     shared account resource; a lookup that did not answer is not a yes.
//     `permissionsUnavailable` carries that up so the save action can refuse to
//     write rather than write to the wrong owner.
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

export interface AccountMemberActivity {
  /** Orders on this site we can attribute to this person (see the SQL note). */
  orders: number;
  lastOrderAt: string | null;
}

export interface AccountMemberView {
  contactId: number;
  name: string;
  /** "" when the viewer is not allowed the account's contact details. */
  email: string;
  phone: string;
  roleName: string;
  role: AccountRoleOption | null;
  isMainContact: boolean;
  isYou: boolean;
  /** High-level activity for the manager (card 8LfB0DZS); null when not shown. */
  activity: AccountMemberActivity | null;
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
  /**
   * True when the role lookup failed and we could not establish who this person
   * is on the account. The screen degrades to read-only and the save refuses —
   * writing to the accountless (own-contact) fallback here would silently store
   * a manager's edit where no colleague can ever see it.
   */
  permissionsUnavailable: boolean;
  /** Are the members' email addresses and phone numbers shown? (PII gate.) */
  showsContactDetails: boolean;
  /**
   * Orders on the account we cannot attribute to any one person — legacy Zoey
   * imports carry an account but no contact. Shown as a caption so a count of 0
   * against a real buyer is never read as "they have never ordered".
   */
  unattributedOrders: number;
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

interface MemberRow {
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
}

interface ActivityRow {
  contact_id: number;
  orders: string;
  last_order_at: string | null;
}

function emptyView(roles: AccountRoleOption[]): AccountPeopleView {
  return {
    accountId: null,
    accountName: null,
    manager: null,
    members: [],
    people: [],
    roles,
    canEdit: true,
    cannotEditReason: null,
    permissionsUnavailable: false,
    showsContactDetails: false,
    unattributedOrders: 0,
  };
}

/** Everything the People section renders, for the signed-in contact. */
export async function loadAccountPeople(contactId: number): Promise<AccountPeopleView> {
  // ── Wave A: independent of each other ──────────────────────────────────
  const [roles, permsResult] = await Promise.all([
    loadAccountRoles(),
    getContactPermissions(contactId).catch((e) => {
      console.error("[account-people] permission lookup threw:", e);
      return null;
    }),
  ]);
  const roleIndex = roles.map((r) => ({ id: r.id, name: r.name }));
  const base = emptyView(roles);

  // `failedOpen` means the resolver could not read the membership and handed
  // back an allow-everything bypass. For CHECKOUT that is the right call; for a
  // shared account list it is not — we do not know whose list this is.
  const permsUnavailable = permsResult === null || permsResult.failedOpen;
  base.permissionsUnavailable = permsUnavailable;
  const perms = permsUnavailable ? null : permsResult;
  const accountId = perms?.isB2B ? perms.accountId : null;

  const sql = getCommerceClient();
  if (!sql) return base;

  if (accountId === null) {
    // Accountless shopper (or a lookup we could not trust). The list lives on
    // their own contact row, which is the only owner that makes sense.
    if (permsUnavailable) {
      base.canEdit = false;
      base.cannotEditReason =
        "We couldn't check your account just now, so this list is read-only. Please reload the page in a moment.";
      return base;
    }
    try {
      const rows = await sql<{ metafields: unknown }[]>`
        SELECT metafields FROM contacts WHERE id = ${contactId} LIMIT 1`;
      base.people = normalisePeople(
        (rows[0]?.metafields as Record<string, unknown> | null)?.account_contacts ?? [],
        roleIndex
      );
    } catch (e) {
      console.error("[account-people] contact list lookup failed:", e);
    }
    return base;
  }

  base.accountId = accountId;
  const seesOrders = Boolean(perms?.can("view_company_orders"));

  // ── Wave B: four independent reads, one round trip ─────────────────────
  const [accountRows, contactRows, memberRows, activityRows] = await Promise.all([
    sql<{ name: string | null; metafields: unknown }[]>`
      SELECT name, metafields FROM accounts WHERE id = ${accountId} LIMIT 1`.catch((e) => {
      console.error("[account-people] account row lookup failed:", e);
      return [] as { name: string | null; metafields: unknown }[];
    }),
    sql<{ metafields: unknown }[]>`
      SELECT metafields FROM contacts WHERE id = ${contactId} LIMIT 1`.catch((e) => {
      console.error("[account-people] contact metafields lookup failed:", e);
      return [] as { metafields: unknown }[];
    }),
    sql<MemberRow[]>`
      SELECT m.contact_id, c.first_name, c.last_name, c.email, c.phone,
             m.is_main_contact, m.role_id, r.name AS role_name,
             r.description, r.permissions, r.scope
      FROM account_memberships m
      JOIN contacts c ON c.id = m.contact_id
      LEFT JOIN account_roles r ON r.id = m.role_id
      WHERE m.account_id = ${accountId}
        AND m.status = 'active'
        AND c.is_active IS NOT FALSE
      ORDER BY m.is_main_contact DESC, c.first_name ASC, c.id ASC`.catch((e) => {
      console.error("[account-people] member lookup failed:", e);
      return [] as MemberRow[];
    }),
    // High-level activity, shown only to someone whose role lets them see the
    // account's orders — a count and a date, never money or line detail.
    //
    // ATTRIBUTION, and why it is not just `contact_id` (production, 2026-08-14):
    // only 20,446 of Industry Kitchens' 33,764 orders carry a contact_id at all.
    // Counting on contact_id alone showed "0 orders placed" against people who
    // have ordered for years, and disagreed with the /account/orders list on the
    // same screen, which also surfaces guest orders by normalised email and does
    // NOT hide cancelled ones. So: attribute by contact_id, else by the same
    // normalised inbox `getGuestOrdersForEmail` uses, else bucket the order under
    // contact 0 — the account's own unattributable history, which the screen
    // reports as a caption rather than pretending it does not exist. Every
    // status counts, exactly as the order list shows every status.
    seesOrders
      ? sql<ActivityRow[]>`
      WITH mem AS (
        SELECT m.contact_id,
               CASE
                 WHEN split_part(lower(c.email), '@', 2) IN ('gmail.com','googlemail.com')
                 THEN regexp_replace(split_part(split_part(lower(c.email), '@', 1), '+', 1), '\\.', '', 'g')
                 ELSE split_part(split_part(lower(c.email), '@', 1), '+', 1)
               END || '@' || split_part(lower(c.email), '@', 2) AS inbox
        FROM account_memberships m
        JOIN contacts c ON c.id = m.contact_id
        WHERE m.account_id = ${accountId}
          AND m.status = 'active'
          AND c.is_active IS NOT FALSE
          AND c.email IS NOT NULL
      ),
      sel AS (
        SELECT o.contact_id, o.created_at,
               CASE
                 WHEN split_part(lower(o.billing_address->>'email'), '@', 2) IN ('gmail.com','googlemail.com')
                 THEN regexp_replace(split_part(split_part(lower(o.billing_address->>'email'), '@', 1), '+', 1), '\\.', '', 'g')
                 ELSE split_part(split_part(lower(o.billing_address->>'email'), '@', 1), '+', 1)
               END || '@' || split_part(lower(o.billing_address->>'email'), '@', 2) AS inbox
        FROM orders o
        WHERE o.channel_id = ${CHANNEL_ID}
          AND (
            o.account_id = ${accountId}
            OR o.contact_id IN (SELECT contact_id FROM mem)
            OR (
              o.contact_id IS NULL
              AND CASE
                    WHEN split_part(lower(o.billing_address->>'email'), '@', 2) IN ('gmail.com','googlemail.com')
                    THEN regexp_replace(split_part(split_part(lower(o.billing_address->>'email'), '@', 1), '+', 1), '\\.', '', 'g')
                    ELSE split_part(split_part(lower(o.billing_address->>'email'), '@', 1), '+', 1)
                  END || '@' || split_part(lower(o.billing_address->>'email'), '@', 2)
                  IN (SELECT inbox FROM mem)
            )
          )
      )
      SELECT COALESCE(bycontact.contact_id, byemail.contact_id, 0) AS contact_id,
             count(*)::text AS orders,
             max(sel.created_at)::text AS last_order_at
      FROM sel
      LEFT JOIN mem bycontact ON bycontact.contact_id = sel.contact_id
      LEFT JOIN mem byemail ON sel.contact_id IS NULL AND byemail.inbox = sel.inbox
      GROUP BY 1`.catch((e) => {
          console.error("[account-people] activity lookup failed — omitted:", e);
          return [] as ActivityRow[];
        })
      : Promise.resolve([] as ActivityRow[]),
  ]);

  base.accountName = accountRows[0]?.name ?? null;

  // The customer-maintained list lives on the ACCOUNT so every colleague sees
  // the same one. A list still sitting on the contact is read ONLY while the
  // account has never been written to — `saveAccountPeople` clears the contact's
  // copy the first time it writes the account's, so a customer who deletes
  // everyone and saves gets an empty list rather than the old rows back.
  const accountMeta = accountRows[0]?.metafields as Record<string, unknown> | null;
  const accountList = accountMeta?.account_contacts;
  const accountOwnsList = Array.isArray(accountList);
  base.people = normalisePeople(
    accountOwnsList
      ? accountList
      : ((contactRows[0]?.metafields as Record<string, unknown> | null)?.account_contacts ?? []),
    roleIndex
  );

  const activity = new Map<number, AccountMemberActivity>(
    activityRows.map((r) => [
      Number(r.contact_id),
      { orders: Number(r.orders) || 0, lastOrderAt: r.last_order_at },
    ])
  );
  base.unattributedOrders = activity.get(0)?.orders ?? 0;

  const you = memberRows.find((m) => Number(m.contact_id) === contactId) ?? null;
  const yourRole =
    you && you.role_id !== null && you.role_name
      ? describeAccountRole({
          id: you.role_id,
          name: you.role_name,
          description: you.description,
          permissions: you.permissions,
          scope: you.scope,
        })
      : null;

  // ── Who may CHANGE the list ────────────────────────────────────────────
  // Same `managesPeople` the screen prints, so what a role is TOLD it can do and
  // what it may actually do cannot drift apart. FAIL CLOSED: a viewer we cannot
  // place on this account (no membership row, no role) does not get write access
  // to a resource every colleague shares. Everyone still SEES the list.
  base.canEdit = Boolean(yourRole?.managesPeople);
  // Zoey keeps the company-people view to the main-contact roles. Names and
  // roles are shown to everyone on the account (they need to know who to ask);
  // colleagues' email addresses and phone numbers are not, so a Restricted Buyer
  // does not get the account's whole contact book.
  base.showsContactDetails = base.canEdit || Boolean(you?.is_main_contact);

  base.members = memberRows.map((m) => {
    const id = Number(m.contact_id);
    const isYou = id === contactId;
    const show = base.showsContactDetails || isYou;
    return {
      contactId: id,
      name: fullName(m.first_name, m.last_name) || (show ? (m.email ?? "") : "A colleague"),
      email: show ? (m.email ?? "") : "",
      phone: show ? (m.phone ?? "") : "",
      roleName: m.role_name ?? "",
      role:
        isYou && yourRole
          ? yourRole
          : m.role_id !== null && m.role_name
            ? describeAccountRole({
                id: m.role_id,
                name: m.role_name,
                description: m.description,
                permissions: m.permissions,
                scope: m.scope,
              })
            : null,
      isMainContact: Boolean(m.is_main_contact),
      isYou,
      activity: seesOrders ? (activity.get(id) ?? { orders: 0, lastOrderAt: null }) : null,
    };
  });

  const manager =
    base.members.find((m) => isManagerRole(m.roleName) && m.email) ??
    base.members.find((m) => isManagerRole(m.roleName)) ??
    null;
  // The manager's own name and email are shown even when the rest of the
  // contact book is not: "ask your account manager" is useless without them.
  const managerRow = manager
    ? memberRows.find((m) => Number(m.contact_id) === manager.contactId)
    : null;
  base.manager = manager
    ? {
        name: manager.name,
        email: manager.email || (managerRow?.email ?? ""),
        isYou: manager.isYou,
      }
    : null;

  if (!base.canEdit) {
    base.cannotEditReason = you
      ? `Your role on this account (${you.role_name || "no role"}) doesn't allow changing who is on it. Ask your account manager${base.manager && !base.manager.isYou ? `, ${base.manager.name}` : ""}.`
      : "We couldn't confirm your role on this account, so this list is read-only. Ask your account manager, or tell us and we will sort it out.";
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
