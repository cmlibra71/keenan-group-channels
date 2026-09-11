// ============================================================================
// THE LINK FROM A CONVERTED QUOTE TO ITS ORDER, on the storefront account quote
// page — whether to draw it, and what it may promise (card isl1uwjR).
//
// The pure half. `converted-order-link-context.ts` reads the order (projected)
// and asks the same two questions the order page itself asks — may this viewer
// open it (`canCustomerViewOrder`), and would this storefront take their money
// for it (`payBalanceDecisionForOrder`, the per-site seam) — and hands the
// answers here.
//
// WHY IT IS NOT JUST "status is converted_to_order and the id is set". A set
// `converted_order_id` does NOT mean the quote is still held by a live order:
// cancelling the order releases the quote and keeps the id as history (card
// KRn2c8ZC, `quote-acceptance-conversion` "Do not break"). The first cut of
// this block read only the quote, and on live Chefs Depot it drew "View and pay
// your order" beside five cancelled orders (four spelt `canceled`, the spelling
// the portal's own Cancel writes), four orders already paid in full, and one
// order belonging to a different contact, which 404s. So:
//
//  • NOTHING when the order is not on this channel, is cancelled (either
//    spelling), or is not one this viewer may open — the order page would 404
//    it, and a link to a 404 is worse than none.
//  • "View and pay your order" ONLY where the order page will actually draw a
//    Pay control for THIS viewer (the decision is the order page's own), and
//    never beside a rep-set DEPOSIT: the quote prints "Deposit due now $X"
//    while the order's control takes the WHOLE balance, no partial payments
//    (cards 0Wy0xHuq x Sh03niVC, recorded on sf-account-quotes).
//  • "View your order" everywhere else — a paid order, an order this viewer's
//    role may not pay by card, and every order on Industry Kitchens, whose
//    order page offers no card payment (the Sh03niVC gap).
// ============================================================================

export const VIEW_AND_PAY_ORDER_LABEL = "View and pay your order";
export const VIEW_ORDER_LABEL = "View your order";

export interface ConvertedOrderLinkInput {
  /** `quotes.converted_order_id`. */
  orderId: number;
  /** False when the order could not be read on THIS channel. */
  orderFound: boolean;
  /** `orders.status`, raw. */
  orderStatus: string | null | undefined;
  /** The order page's own access rule (`canCustomerViewOrder`) for this viewer. */
  viewable: boolean;
  /** The order page's own pay decision (`payBalanceDecisionForOrder`) for this viewer. */
  payAllowed: boolean;
  /** The quote carries a rep-set deposit the customer is shown as "due now". */
  carriesDeposit: boolean;
}

export interface ConvertedOrderLink {
  href: string;
  label: string;
}

/** Cancelled, in either live spelling. */
export function isCancelledOrderStatus(status: string | null | undefined): boolean {
  const s = (status ?? "").trim().toLowerCase();
  return s === "cancelled" || s === "canceled";
}

export function convertedOrderLink(input: ConvertedOrderLinkInput): ConvertedOrderLink | null {
  const id = input.orderId;
  if (!Number.isInteger(id) || id <= 0) return null;
  if (!input.orderFound || !input.viewable) return null;
  if (isCancelledOrderStatus(input.orderStatus)) return null;
  return {
    href: `/account/orders/${id}`,
    label: input.payAllowed && !input.carriesDeposit ? VIEW_AND_PAY_ORDER_LABEL : VIEW_ORDER_LABEL,
  };
}
