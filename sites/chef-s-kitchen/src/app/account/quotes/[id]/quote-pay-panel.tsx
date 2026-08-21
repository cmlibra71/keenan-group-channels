"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { payQuote, confirmQuotePayment } from "@/lib/actions/quote-payment";
import type { QuotePayState } from "@/lib/quotes/quote-payable";

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

export interface PayMethod {
  id: string;
  name: string;
  description: string;
  bankDetails?: {
    bankName: string;
    accountName: string;
    bsb: string;
    accountNumber: string;
    reference?: string;
  };
  netTermsDays?: number;
}

export interface PayAddressOption {
  id: number;
  label: string;
}

/**
 * "Pay this quote" — the customer-facing payment step, inside their logged-in
 * account area (Steve, card 0Wy0xHuq).
 *
 * The Pay button is never simply removed while a quote is nearly payable: it
 * stays visible and greyed with the reason on hover, the same treatment the
 * Accept button uses. The state is resolved SERVER-side by
 * `resolveQuotePayState` and re-checked inside `payQuote`, so this component
 * can never offer something the server would refuse.
 */
export function QuotePayPanel({
  quoteId,
  payState,
  amountDue,
  amountKnown,
  totalDue,
  depositNote,
  methods,
  stripePublishableKey,
  addressSummary,
  addressOptions,
  freightPending,
  currency,
}: {
  quoteId: number;
  payState: QuotePayState;
  /** Formatted amount the customer is charged now (the deposit, when there is one). */
  amountDue: string;
  /** False while pricing is still being prepared — there is no figure to show yet. */
  amountKnown: boolean;
  /** Formatted full quote total inc GST. */
  totalDue: string;
  /** e.g. "Deposit due now (50%) — balance $33.55 after delivery." */
  depositNote: string | null;
  methods: PayMethod[];
  stripePublishableKey?: string | null;
  /** The quote's agreed delivery address, read-only — customers can't change it. */
  addressSummary: string | null;
  /** Only offered when the quote carries NO address of its own. */
  addressOptions: PayAddressOption[];
  freightPending: boolean;
  currency: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [method, setMethod] = useState(methods[0]?.id ?? "");
  const [addressId, setAddressId] = useState<number | null>(addressOptions[0]?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [cardReady, setCardReady] = useState(false);
  const [processing, setProcessing] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripeRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cardElementRef = useRef<any>(null);
  const cardContainerRef = useRef<HTMLDivElement>(null);

  const cardSelected = method === "stripe" && !!stripePublishableKey;

  // Mount Stripe's card element only while the card method is selected.
  useEffect(() => {
    if (!cardSelected) return;
    let mounted = true;
    (async () => {
      try {
        await loadStripeScript();
        if (!mounted || !window.Stripe) return;
        const stripe = window.Stripe(stripePublishableKey!);
        stripeRef.current = stripe;
        const card = stripe.elements().create("card", {
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
  }, [cardSelected, stripePublishableKey]);

  if (payState.kind === "hidden") return null;

  const disabled = payState.kind === "disabled";

  async function onPay() {
    setError(null);
    if (cardSelected) {
      // Card: the action creates the order + PaymentIntent, then we confirm here.
      setProcessing(true);
      try {
        const r = await payQuote(quoteId, method, addressId);
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
          setError(stripeErr.message || "Your payment was declined.");
          setProcessing(false);
          return;
        }
        await confirmQuotePayment(r.stripe.orderNumber);
        router.push(`/checkout/confirmation?order=${r.stripe.orderNumber}&pm=stripe`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Payment failed.");
        setProcessing(false);
      }
      return;
    }
    start(async () => {
      const r = await payQuote(quoteId, method, addressId);
      if (r.error) {
        setError(r.error);
        return;
      }
      if (r.placed) {
        router.push(
          `/checkout/confirmation?order=${r.placed.orderNumber}&pm=${encodeURIComponent(
            r.placed.paymentMethod
          )}`
        );
      } else {
        router.refresh();
      }
    });
  }

  const busy = pending || processing;
  const selected = methods.find((m) => m.id === method);

  return (
    <div className="mt-8 rounded-lg border border-border p-5">
      <h2 className="text-base font-semibold text-text-primary">Pay this quote</h2>

      <div className="mt-3 flex items-baseline justify-between border-b border-border pb-3">
        <span className="text-sm text-text-secondary">Amount payable now</span>
        <span className="text-2xl font-semibold text-text-primary">
          {amountKnown ? amountDue : "To be confirmed"}
        </span>
      </div>
      {depositNote && <p className="mt-2 text-sm text-text-secondary">{depositNote}</p>}
      {!depositNote && amountKnown && (
        <p className="mt-2 text-xs text-text-muted">
          {totalDue} including GST — the amount agreed on this quote.
        </p>
      )}
      {amountKnown && freightPending && (
        <p className="mt-2 rounded-md bg-warning-bg px-3 py-2 text-sm text-warning">
          <strong>Plus Freight.</strong> Delivery is not included in this amount and will be
          quoted separately.
        </p>
      )}

      {/* Delivery address. An agreed address on a quote is not the customer's to
          change (Steve: staff can change it, customers can't) — the quote page above
          states it in full, with how to get it changed, so this panel says nothing
          when the quote has one. A legacy quote that never carried one still needs a
          delivery address before it can be paid, so it takes a saved one here. */}
      {addressSummary ? null : addressOptions.length > 0 ? (
        <div className="mt-4">
          <label
            htmlFor="quote-pay-address"
            className="text-xs font-medium uppercase tracking-wide text-text-muted"
          >
            Deliver to
          </label>
          <select
            id="quote-pay-address"
            value={addressId ?? ""}
            onChange={(e) => setAddressId(Number(e.target.value))}
            disabled={disabled || busy}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50"
          >
            {addressOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {/* Payment methods — exactly the ones this store (and this account) allows. */}
      {methods.length > 0 && (
        <fieldset className="mt-4">
          <legend className="text-xs font-medium uppercase tracking-wide text-text-muted">
            How would you like to pay?
          </legend>
          <div className="mt-2 space-y-2">
            {methods.map((m) => (
              <label
                key={m.id}
                className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${
                  method === m.id ? "border-zinc-900 bg-surface-secondary" : "border-border"
                }`}
              >
                <input
                  type="radio"
                  name="quote-payment-method"
                  value={m.id}
                  checked={method === m.id}
                  onChange={() => setMethod(m.id)}
                  disabled={disabled || busy}
                  className="mt-1"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-text-primary">{m.name}</span>
                  {m.description && (
                    <span className="block text-xs text-text-muted">{m.description}</span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {cardSelected && (
        <div className="mt-3 rounded-md border border-border p-3">
          <div ref={cardContainerRef} />
        </div>
      )}

      {selected?.id === "bank_transfer" && selected.bankDetails && (
        <div className="mt-3 rounded-md bg-surface-secondary p-3 text-sm text-text-secondary">
          <p className="font-medium text-text-primary">Our bank details</p>
          <p className="mt-1">
            {selected.bankDetails.bankName} · {selected.bankDetails.accountName}
            <br />
            BSB {selected.bankDetails.bsb} · Account {selected.bankDetails.accountNumber}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Confirm below and we&apos;ll email you these details with your order number as the
            payment reference.
          </p>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-sale-deep">{error}</p>}

      <div className="mt-4">
        {disabled ? (
          <span className="group relative inline-flex w-full cursor-not-allowed" title={payState.reason}>
            <button
              type="button"
              aria-disabled="true"
              tabIndex={-1}
              className="pointer-events-none w-full rounded-md bg-text-primary px-4 py-2.5 text-sm font-medium text-white opacity-50"
            >
              {amountKnown ? `Pay ${amountDue}` : "Pay this quote"}
            </button>
            <span
              role="tooltip"
              className="pointer-events-none invisible absolute bottom-full left-1/2 z-50 mb-2 block w-max max-w-xs -translate-x-1/2 rounded-md bg-text-primary px-3 py-2 text-xs text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:visible group-hover:opacity-100"
            >
              {payState.reason}
            </span>
          </span>
        ) : (
          <button
            type="button"
            onClick={onPay}
            disabled={busy || !method || (cardSelected && !cardReady)}
            className="w-full rounded-md bg-text-primary px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Working…" : amountKnown ? `Pay ${amountDue}` : "Pay this quote"}
          </button>
        )}
        {disabled && <p className="mt-2 text-xs text-text-muted">{payState.reason}</p>}
      </div>
      <p className="mt-2 text-center text-[11px] text-text-muted">
        Paying accepts this quote. Prices are locked once accepted — {currency} amounts shown
        include GST.
      </p>
    </div>
  );
}
