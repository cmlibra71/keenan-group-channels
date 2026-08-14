"use server";

import { revalidatePath } from "next/cache";
import { ApiError, ORDER_BALANCE_PAYMENT_PURPOSE, PAYMENT_PURPOSE_METADATA_KEY } from "@keenan/services";
import { orderService, paymentService, CHANNEL_ID } from "@/lib/store";
import { getSession } from "@/lib/auth";
import { canCustomerViewOrder } from "@/lib/orders/order-visibility";
import { resolvePayBalance, type PayBalanceOrderRow } from "@/lib/orders/pay-balance-context";

/**
 * Paying off what is still owing on an order the customer already placed — card
 * Sh03niVC, split out of Fiona's Order History card.
 *
 * The gap it closes: card payment only ever existed INSIDE checkout, so an order
 * that came out of checkout unpaid (bank transfer never sent, a declined card, a
 * deposit) could only be settled by transferring money or ringing us.
 *
 * Three things about the money are deliberate:
 *
 *  * THE AMOUNT IS NEVER SUPPLIED BY THE BROWSER. It is the whole outstanding
 *    balance, recomputed here from the order's own ledger at the moment of
 *    charging. Tim ruled out partial payments, and an amount that crossed the
 *    wire would be an amount somebody could edit.
 *  * THE GATE IS RE-ASKED, not trusted. `resolvePayBalance` is the same function
 *    the page rendered the button from, so a stale tab, a revoked role or an
 *    order paid five minutes ago by a colleague all refuse here.
 *  * THE LEDGER IS STILL WRITTEN FROM STRIPE. This action creates a PaymentIntent
 *    and nothing else; the portal's webhook records the payment once Stripe says
 *    `succeeded` (Tim, 27-Jul: "Stripe is the source of truth for payment
 *    status"). The storefront never marks an order paid — the same rule checkout
 *    and the quote-payment path already follow.
 *
 * The intent is stamped `payment_purpose = order_balance` so the webhook knows
 * this is an existing order being settled, not a new order arriving: the customer
 * gets a Paid Tax Invoice Receipt and the order's salesperson is told, instead of
 * an order confirmation and a "new order" alert for an order placed weeks ago.
 */

export type StartBalancePaymentResult = {
  error?: string;
  stripe?: { clientSecret: string; amount: string };
};

const GENERIC_REFUSAL = "This order can't be paid by card right now. Please contact us.";

/** Load the order with just enough to decide, or null when it is not this shopper's to see. */
async function loadPayableOrder(
  orderId: number,
  session: { contactId: number; email: string }
): Promise<(PayBalanceOrderRow & { channel_id: number; contact_id: number | null; order_number: string | null }) | null> {
  let order: PayBalanceOrderRow & {
    channel_id: number;
    contact_id: number | null;
    order_number: string | null;
  };
  try {
    order = (await orderService.getByIdScoped(orderId, { channelId: CHANNEL_ID }, [
      "transactions",
    ])) as unknown as typeof order;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
  const visible = await canCustomerViewOrder(
    { id: order.id, channel_id: order.channel_id, contact_id: order.contact_id },
    session
  );
  return visible ? order : null;
}

export async function startOrderBalancePayment(
  orderId: number
): Promise<StartBalancePaymentResult> {
  if (!Number.isInteger(orderId) || orderId <= 0) return { error: GENERIC_REFUSAL };

  const session = await getSession();
  if (!session?.contactId) return { error: "Please sign in to pay this order." };

  const order = await loadPayableOrder(orderId, session);
  // Same answer for "no such order" and "not yours": a distinct message would
  // confirm an order exists to somebody guessing at ids.
  if (!order) return { error: GENERIC_REFUSAL };

  const decision = await resolvePayBalance(order, session);
  if (!decision.allowed) {
    return { error: decision.message ?? GENERIC_REFUSAL };
  }

  try {
    const { clientSecret } = await paymentService.createStripePaymentIntent(order.id, {
      // Server-derived, to the cent. Never what the browser asked for.
      amount: decision.amount.toFixed(2),
      description: `Balance of order ${order.order_number ?? order.id}`,
      customer_email: session.email,
      metadata: { [PAYMENT_PURPOSE_METADATA_KEY]: ORDER_BALANCE_PAYMENT_PURPOSE },
      // Keeps this intent distinct from a checkout intent for the same order and
      // the same amount — Stripe replays an idempotent request for 24 hours, and
      // being handed the older intent back would also hand back its metadata.
      purpose: ORDER_BALANCE_PAYMENT_PURPOSE,
    });
    return { stripe: { clientSecret, amount: decision.amount.toFixed(2) } };
  } catch (err) {
    console.error("[startOrderBalancePayment] intent creation failed:", err);
    return {
      error:
        err instanceof Error && /not properly configured|not Stripe/i.test(err.message)
          ? "Card payment isn't available right now. Please contact us."
          : "We couldn't start the payment. Please try again, or contact us.",
    };
  }
}

/**
 * Called once `stripe.confirmCardPayment()` resolves in the browser. It refreshes
 * the order page and nothing more: the payment itself is recorded by the portal
 * webhook, so this must never be the thing that decides an order is paid. The
 * page may briefly still show a balance — the panel says so in words rather than
 * pretending otherwise.
 */
export async function confirmOrderBalancePayment(
  orderId: number
): Promise<{ success: boolean }> {
  const session = await getSession();
  if (!session?.contactId) return { success: false };
  const order = await loadPayableOrder(orderId, session).catch(() => null);
  if (!order) return { success: false };
  revalidatePath(`/account/orders/${orderId}`);
  revalidatePath("/account/orders");
  return { success: true };
}
