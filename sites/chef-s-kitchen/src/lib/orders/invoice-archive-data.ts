import { getCommerceClient } from "@keenan/services";
import { CHANNEL_ID, guestOrderForEmailCondition, normalizeEmailForMatch } from "@/lib/store";
import { getContactPermissions, getAccountContactIds } from "@/lib/role-permissions";
import type { ArchiveCandidate } from "./invoice-archive";

/**
 * WHICH ORDERS ARE THIS SIGNED-IN CUSTOMER'S, for the purpose of handing them their tax invoices
 * (card WlTnY4cd) — the impure half of `invoice-archive.ts`.
 *
 * ── THE OWNERSHIP CHECK IS THE FEATURE ───────────────────────────────────────────────────────
 * The portal serves each invoice against the ORDER'S UUID with no session, which is safe for one
 * document a customer was handed a link to and is emphatically not a way to decide whose invoices
 * these are. So the whole "are these yours?" question is answered HERE, from the session, using the
 * same three routes into an order that `/account/orders` and `/account/orders/[id]` already use
 * (`order-access.ts`, register `sf-account-orders`):
 *
 *   1. the customer's OWN orders;
 *   2. a colleague's order on their account, but only where the account role grants
 *      `view_company_orders` — a failed membership lookup yields an EMPTY member list, which means
 *      own-orders-only, never wider;
 *   3. a GUEST order (no customer, no contact) whose billing email normalises to their inbox,
 *      matched by `guestOrderForEmailCondition` — THE shared rule, imported rather than restated,
 *      because a looser copy of that CASE expression widens who can read an order.
 *
 * Every read is CHANNEL-SCOPED in SQL. Chefs Depot and Industry Kitchens are separate businesses
 * and their documents never cross (Product Brief §3).
 *
 * ── PROJECTED, NOT READ-THEN-HIDDEN ──────────────────────────────────────────────────────────
 * These queries name five columns and one boolean and nothing else. The standing rule for a
 * customer-facing surface is to project in SQL rather than select the row and narrow afterwards,
 * because a dev build serialises every awaited value into the page (BIig1Zo1) — and `orders`
 * carries `staff_notes`, `internal_memo` and the cost prices on its lines. Nothing here reads the
 * money columns at all: the archive is a list of documents, and every figure inside one is the
 * portal's to render.
 */

/**
 * How far back one archive request looks.
 *
 * The cap on the archive itself is 50 documents, but an order can be dropped after it is read —
 * cancelled, refunded, or carrying no live lines — so reading exactly 50 rows would return fewer
 * than 50 invoices to a customer who has them. Production, 2026-09-05: the largest single order
 * history is 112 orders for a contact and 130 for an account, so 250 rows is every order every
 * customer we have has ever placed, and the cap that actually bites is the documented one.
 */
const HISTORY_WINDOW = 250;

export interface ArchiveOrderRow extends ArchiveCandidate {
  id: number;
  orderNumber: string | null;
  createdAt: Date | null;
}

interface ProjectedRow {
  id: number;
  uuid: string | null;
  order_number: string | null;
  status: string | null;
  created_at: string | Date | null;
  has_live_lines: boolean;
}

function toArchiveRow(row: ProjectedRow): ArchiveOrderRow {
  return {
    id: row.id,
    uuid: row.uuid,
    orderNumber: row.order_number,
    status: row.status,
    hasLiveLines: Boolean(row.has_live_lines),
    createdAt: row.created_at ? new Date(row.created_at) : null,
  };
}

/**
 * This customer's orders, newest first, projected to what the archive needs.
 *
 * Two queries rather than one OR, deliberately: the guest match is a function over
 * `billing_address->>'email'` and cannot use an index, so OR-ing it into the contact-scoped read
 * would force the whole `orders` table to be scanned even for a customer who has never checked out
 * as a guest. `/account/orders` splits them for the same reason; this keeps the same two plans.
 *
 * Best effort on the guest half, exactly as the order list is: a customer must never lose their own
 * order history because the guest lookup had a bad moment.
 */
export async function loadArchiveOrders(session: {
  contactId: number;
  email: string;
}): Promise<ArchiveOrderRow[]> {
  const sql = getCommerceClient();
  if (!sql || !session?.contactId) return [];

  // The account-role gate, resolved exactly as the order list resolves it. An empty member list
  // (no role, no grant, or a lookup that did not answer) degrades to own-orders-only.
  const perms = await getContactPermissions(session.contactId);
  const seesWholeAccount =
    perms.isB2B && perms.accountId !== null && perms.can("view_company_orders");
  const memberIds = seesWholeAccount ? await getAccountContactIds(perms.accountId!) : [];
  const contactIds = memberIds.length > 0 ? memberIds : [session.contactId];

  const own = sql<ProjectedRow[]>`
    SELECT id,
           uuid::text AS uuid,
           order_number,
           status,
           created_at,
           EXISTS (
             SELECT 1 FROM order_items oi
              WHERE oi.order_id = orders.id AND oi.cancelled_at IS NULL
           ) AS has_live_lines
      FROM orders
     WHERE channel_id = ${CHANNEL_ID}
       AND contact_id = ANY(${contactIds}::int[])
     ORDER BY created_at DESC NULLS LAST, id DESC
     LIMIT ${HISTORY_WINDOW}`;

  const normalizedEmail = normalizeEmailForMatch(session.email ?? "");
  const guest = normalizedEmail
    ? sql<ProjectedRow[]>`
        SELECT id,
               uuid::text AS uuid,
               order_number,
               status,
               created_at,
               EXISTS (
                 SELECT 1 FROM order_items oi
                  WHERE oi.order_id = orders.id AND oi.cancelled_at IS NULL
               ) AS has_live_lines
          FROM orders
         WHERE ${guestOrderForEmailCondition(sql, normalizedEmail)}
         ORDER BY created_at DESC NULLS LAST, id DESC
         LIMIT ${HISTORY_WINDOW}`.catch(() => [] as ProjectedRow[])
    : Promise.resolve([] as ProjectedRow[]);

  const [ownRows, guestRows] = await Promise.all([own, guest]);

  const seen = new Set<number>();
  const merged: ArchiveOrderRow[] = [];
  for (const row of [...ownRows, ...guestRows]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(toArchiveRow(row));
  }
  merged.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0) || b.id - a.id);
  return merged;
}
