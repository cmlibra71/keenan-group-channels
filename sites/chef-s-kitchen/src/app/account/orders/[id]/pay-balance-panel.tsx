"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard } from "lucide-react";
import {
  startOrderBalancePayment,
  confirmOrderBalancePayment,
} from "@/lib/actions/order-payment";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Stripe?: (key: string) => any;
  }
}

function loadStripeScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Stripe) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://js.stripe.com/v3/";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Stripe.js"));
    document.head.appendChild(script);
  });
}

/**
 * "Pay by card" on the customer's own order — card Sh03niVC.
 *
 * The same card form as checkout and as paying a quote (Stripe Elements, one
 * card field, our own button), because it is the same payment: Tim asked for the
 * outstanding amount to be payable "using the same card checkout".
 *
 * The amount is READ-ONLY here and is never sent to the server. Tim ruled out
 * partial payments, so there is nothing to type; the action recomputes the
 * balance from the order's ledger and charges that. The figure on the button is
 * therefore a statement of what will be charged, not an input.
 *
 * Whether this panel renders at all is decided on the server by
 * `decidePayBalance` and re-decided inside the action, so the button can never
 * offer a payment the server would refuse.
 */
export function PayBalancePanel({
  orderId,
  amount,
  currencyLabel,
  stripePublishableKey,
}: {
  orderId: number;
  /** The whole outstanding balance, inc GST. Display only. */
  amount: number;
  /** e.g. "$154.00" — formatted by the server so it matches the rest of the page. */
  currencyLabel: string;
  stripePublishableKey?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cardReady, setCardReady] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [paid, setPaid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripeRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cardElementRef = useRef<any>(null);
  const cardContainerRef = useRef<HTMLDivElement>(null);

  // Mount Stripe's card field only once the customer has asked to pay — a page
  // somebody is only reading should not be loading a payment form.
  useEffect(() => {
    if (!open || paid || !stripePublishableKey) return;
    let mounted = true;
    (async () => {
      try {
        await loadStripeScript();
        if (!mounted || !window.Stripe) return;
        const stripe = window.Stripe(stripePublishableKey);
        stripeRef.current = stripe;
        const card = stripe.elements().create("card", {
          // The order already carries a billing address; asking for a postcode
          // again in the widget is a second place to get it wrong.
          hidePostalCode: true,
          style: {
            base: {
              fontSize: "16px",
              color: "#18181b",
              fontFamily: "system-ui, -apple-system, sans-serif",
              "::placeholder": { color: "#a1a1aa" },
            },
            invalid: { color: "#dc2626" },
          },
        });
        if (cardContainerRef.current) {
          card.mount(cardContainerRef.current);
          cardElementRef.current = card;
          card.on("ready", () => mounted && setCardReady(true));
          card.on("change", (e: { error?: { message: string } }) =>
            mounted ? setError(e.error ? e.error.message : null) : undefined
          );
        }
      } catch {
        if (mounted) setError("We couldn't load the card form. Please try again.");
      }
    })();
    return () => {
      mounted = false;
      cardElementRef.current?.destroy();
      cardElementRef.current = null;
      setCardReady(false);
    };
  }, [open, paid, stripePublishableKey]);

  async function onPay() {
    if (processing) return;
    setProcessing(true);
    setError(null);
    try {
      const r = await startOrderBalancePayment(orderId);
      if (r.error || !r.stripe) {
        setError(r.error ?? "We couldn't start the payment.");
        setProcessing(false);
        return;
      }
      const { error: stripeErr } = await stripeRef.current.confirmCardPayment(
        r.stripe.clientSecret,
        { payment_method: { card: cardElementRef.current } }
      );
      if (stripeErr) {
        // Nothing was charged and nothing was recorded — the customer can try
        // another card without leaving the page.
        setError(stripeErr.message || "Your payment was declined.");
        setProcessing(false);
        return;
      }
      setPaid(true);
      setProcessing(false);
      await confirmOrderBalancePayment(orderId);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed.");
      setProcessing(false);
    }
  }

  if (paid) {
    return (
      <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <h3 className="text-sm font-semibold text-emerald-900">Payment received</h3>
        <p className="mt-1 text-sm text-emerald-800">
          Thank you — we have taken {currencyLabel} from your card. Your Paid Tax Invoice Receipt
          is on its way by email. The figures on this page update as soon as the payment is
          confirmed, which is usually within a minute.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-lg border border-zinc-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-zinc-500" />
          <h3 className="text-sm font-semibold text-zinc-900">Pay by card</h3>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Pay {currencyLabel}
          </button>
        )}
      </div>
      <p className="mt-2 text-sm text-zinc-600">
        Pay the full outstanding balance of <strong>{currencyLabel}</strong> (inc GST) on this
        order. Part payments aren&apos;t available online — to arrange one, contact us.
      </p>

      {open && (
        <>
          {stripePublishableKey ? (
            <div className="mt-3 rounded-md border border-zinc-200 p-3">
              <div ref={cardContainerRef} />
            </div>
          ) : (
            <p className="mt-3 text-sm text-red-600">
              Card payment isn&apos;t available right now. Please contact us.
            </p>
          )}

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <button
            type="button"
            onClick={onPay}
            disabled={processing || !cardReady || !stripePublishableKey}
            className="mt-3 w-full rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {processing ? "Taking payment…" : `Pay ${currencyLabel} now`}
          </button>
          <p className="mt-2 text-center text-[11px] text-zinc-400">
            Amount shown includes GST. Your card is charged once — {amount.toFixed(2)} AUD.
          </p>
        </>
      )}
    </div>
  );
}
