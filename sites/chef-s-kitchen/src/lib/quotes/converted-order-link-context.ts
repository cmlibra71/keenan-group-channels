// ============================================================================
// The impure half of the converted-quote → order link (card isl1uwjR): read the
// order, then ask the order page's OWN two questions about it, so the quote
// page's link can never promise more than the page it opens.
//
//  1. May this viewer open it? `canCustomerViewOrder` — the one access gate the
//     order page and the pay-balance action already share.
//  2. Would this storefront take their money for it? `payBalanceDecisionForOrder`
//     — the per-site seam (`lib/orders/pay-balance-site.tsx`): Chefs Depot asks
//     `resolvePayBalance`, the default copy (Industry Kitchens) answers "not
//     offered" without any I/O.
//
// PROJECTED, never the whole row (Product Brief §3: on a customer-facing surface
// load only what you render — a dev build serialises every awaited value into
// the page). The order page's own `getByIdScoped` reads the full row and says so
// as a known gap; this page must not inherit it. Out of `metafields` only the
// `test_mode` marker is read, which is all `decidePayBalance` asks of the bag.
//
// Never throws: a link that cannot be decided is not drawn, and the quote page
// must not 500 over it.
// ============================================================================

import { getCommerceDb, orders, orderTransactions } from "@keenan/services";
import { and, eq, sql } from "drizzle-orm";
import { CHANNEL_ID } from "@/lib/store";
import { canCustomerViewOrder } from "@/lib/orders/order-visibility";
import { payBalanceDecisionForOrder } from "@/lib/orders/pay-balance-site";
import type { PayBalanceOrderRow } from "@/lib/orders/pay-balance-context";
import { convertedOrderLink, type ConvertedOrderLink } from "./converted-order-link";

export async function resolveConvertedOrderLink(
  orderId: number,
  session: { contactId: number; email: string },
  opts: { carriesDeposit: boolean }
): Promise<ConvertedOrderLink | null> {
  if (!Number.isInteger(orderId) || orderId <= 0) return null;
  try {
    const db = getCommerceDb();
    const [row] = await db
      .select({
        id: orders.id,
        channel_id: orders.channelId,
        contact_id: orders.contactId,
        account_id: orders.accountId,
        status: orders.status,
        payment_status: orders.paymentStatus,
        external_source: orders.externalSource,
        total_inc_tax: orders.totalIncTax,
        refunded_amount: orders.refundedAmount,
        test_mode: sql<string | null>`${orders.metafields}->>'test_mode'`,
      })
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.channelId, CHANNEL_ID)))
      .limit(1);
    if (!row) {
      return convertedOrderLink({
        orderId,
        orderFound: false,
        orderStatus: null,
        viewable: false,
        payAllowed: false,
        carriesDeposit: opts.carriesDeposit,
      });
    }

    const viewable = await canCustomerViewOrder(
      { id: row.id, channel_id: row.channel_id ?? 0, contact_id: row.contact_id ?? null },
      session
    );
    // Not viewable = no link, and no reason to spend the pay decision's lookups.
    if (!viewable) return null;

    const transactions = await db
      .select({
        amount: orderTransactions.amount,
        event: orderTransactions.event,
        status: orderTransactions.status,
      })
      .from(orderTransactions)
      .where(eq(orderTransactions.orderId, row.id));

    const payRow: PayBalanceOrderRow = {
      id: row.id,
      status: row.status ?? null,
      payment_status: row.payment_status ?? null,
      account_id: row.account_id ?? null,
      external_source: row.external_source ?? null,
      metafields: { test_mode: row.test_mode === "true" },
      total_inc_tax: row.total_inc_tax ?? null,
      refunded_amount: row.refunded_amount ?? null,
      transactions,
    };
    const decision = await payBalanceDecisionForOrder(payRow, session);

    return convertedOrderLink({
      orderId,
      orderFound: true,
      orderStatus: row.status,
      viewable,
      payAllowed: decision.allowed,
      carriesDeposit: opts.carriesDeposit,
    });
  } catch (e) {
    console.error(`[account quote] converted-order link for order ${orderId} not decided:`, e);
    return null;
  }
}
