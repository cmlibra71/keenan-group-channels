import { getSession } from "@/lib/auth";
import { orderService } from "@/lib/store";
import { getLastOrder } from "./last-order";

/**
 * May the current visitor see this order's confirmation?
 *
 * The confirmation page took its order number straight from `?order=` and
 * rendered totals and line items with no check at all. That was survivable only
 * because generated numbers look like ORD-MSCYA5IL-C11K — security by
 * unguessability, which the checkout action already calls out as "semi-guessable".
 * The moment order numbers become readable per-site sequences (CD-00001…), every
 * customer's order would be enumerable by anyone. This closes that.
 *
 * Two legitimate viewers, so two ways to pass:
 *  - a SIGNED-IN customer whose contact owns the order; or
 *  - a GUEST who just placed it — proven by the short-lived httpOnly `last_order`
 *    cookie the checkout writes for exactly this purpose (guests never get a
 *    session, so ownership alone would break the normal guest confirmation).
 *
 * Fails CLOSED: any lookup error denies. Being shown a slightly bare
 * confirmation page is a far better failure than leaking someone's order.
 */
export async function canViewOrderConfirmation(orderNumber: string): Promise<boolean> {
  if (!orderNumber) return false;

  // Guest path first — no DB round trip needed, and it is the common case
  // immediately after checkout.
  try {
    const last = await getLastOrder();
    if (last?.order && last.order === orderNumber) return true;
  } catch {
    /* fall through to the ownership check */
  }

  try {
    const session = await getSession();
    if (!session) return false;
    const res = await orderService.list({
      page: 1,
      limit: 1,
      sort: "id",
      direction: "desc",
      filters: { order_number: { type: "eq", value: orderNumber } },
    });
    const order = res.data[0] as { contact_id?: number | null } | undefined;
    if (!order) return false;
    return order.contact_id != null && order.contact_id === session.contactId;
  } catch {
    return false;
  }
}
