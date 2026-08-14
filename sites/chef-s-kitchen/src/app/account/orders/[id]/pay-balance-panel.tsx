"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard } from "lucide-react";
import { Price } from "@/components/ui/Price";
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

/** What Stripe said happened, once the card form came back without an error. */
type Outcome = "paid" | "processing";

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
 * therefore a statement of what will be charged, not an input — and it is
 * rendered by the same `Price` component as every other figure on this page, so
 * the button and the "Still outstanding" row cannot format the same money two
 * different ways.
 *
 * Whether this panel renders at all is decided on the server by
 * `decidePayBalance` and re-decided inside the action, so the button can never
 * offer a payment the server would refuse.
 *
 * Painted in the storefront's own tokens (`text-text-primary`, `border-border`,
 * `bg-accent-subtle`, `text-sale-deep`), not raw Tailwind greys — this panel
 * sits inside the Payment card, three lines below a refusal sentence and beside
 * the "How to pay" panel, and a second palette in that space reads as a bolted-on
 * widget rather than part of the page.
 */
export function PayBalancePanel({
  orderId,
  amount,
  stripePublishableKey,
}: {
  orderId: number;
  /** The whole outstanding balance, inc GST. Display only. */
  amount: number;
  stripePublishableKey?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cardReady, setCardReady] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripeRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cardElementRef = useRef<any>(null);
  const cardContainerRef = useRef<HTMLDivElement>(null);

  // Mount Stripe's card field only once the customer has asked to pay — a page
  // somebody is only reading should not be loading a payment form.
  useEffect(() => {
    if (!open || outcome || !stripePublishableKey) return;
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
  }, [open, outcome, stripePublishableKey]);

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
      const { error: stripeErr, paymentIntent } = await stripeRef.current.confirmCardPayment(
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
      // No error is not the same as taken. A card that needs the bank to settle
      // overnight comes back `processing`, and one still finishing an
      // authentication step comes back `requires_action` — telling either of
      // those customers "Payment received" claims money we do not have. Only
      // `succeeded` earns the receipt sentence; anything else says what is
      // actually true, which is that we are waiting on the bank.
      setOutcome(paymentIntent?.status === "succeeded" ? "paid" : "processing");
      setProcessing(false);
      await confirmOrderBalancePayment(orderId);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed.");
      setProcessing(false);
    }
  }

  if (outcome) {
    return (
      <div className="mt-5 rounded-lg border border-accent/30 bg-accent-subtle p-4">
        <h3 className="text-sm font-semibold text-accent-dark">
          {outcome === "paid" ? "Payment received" : "Payment in progress"}
        </h3>
        <p className="mt-1 text-sm text-accent-dark">
          {outcome === "paid" ? (
            <>
              Thank you — we have taken <Price amount={amount} /> from your card. Your Paid Tax
              Invoice Receipt is on its way by email. The figures on this page update as soon as
              the payment is confirmed, which is usually within a minute.
            </>
          ) : (
            <>
              Your bank is still processing this <Price amount={amount} /> payment. We&apos;ll
              email your Paid Tax Invoice Receipt and update the figures on this page as soon as
              it clears. There is no need to pay again.
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-semibold text-text-primary">Pay by card</h3>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-md bg-text-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Pay <Price amount={amount} />
          </button>
        )}
      </div>
      <p className="mt-2 text-sm text-text-secondary">
        Pay the full outstanding balance of{" "}
        <strong className="text-text-primary">
          <Price amount={amount} />
        </strong>{" "}
        (inc GST) on this order. Part payments aren&apos;t available online — to arrange one,
        contact us.
      </p>

      {open && (
        <>
          {stripePublishableKey ? (
            <div className="mt-3 rounded-md border border-border p-3">
              <div ref={cardContainerRef} />
            </div>
          ) : (
            <p className="mt-3 text-sm text-sale-deep">
              Card payment isn&apos;t available right now. Please contact us.
            </p>
          )}

          {error && <p className="mt-3 text-sm text-sale-deep">{error}</p>}

          <button
            type="button"
            onClick={onPay}
            disabled={processing || !cardReady || !stripePublishableKey}
            className="mt-3 w-full rounded-md bg-text-primary px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {processing ? (
              "Taking payment…"
            ) : (
              <>
                Pay <Price amount={amount} /> now
              </>
            )}
          </button>
          <p className="mt-2 text-center text-[11px] text-text-muted">
            Amount shown includes GST. Your card is charged once.
          </p>
        </>
      )}
    </div>
  );
}
