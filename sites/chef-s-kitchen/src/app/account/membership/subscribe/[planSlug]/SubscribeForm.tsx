"use client";

import { useState, useEffect, useRef } from "react";
import { createSubscription, attemptTestMembership } from "@/lib/actions/subscription";

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

export function SubscribeForm({
  planId,
  stripePublishableKey,
}: {
  planId: number;
  stripePublishableKey: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardReady, setCardReady] = useState(false);
  const [testCard, setTestCard] = useState("");
  const cardContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripeRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cardElementRef = useRef<any>(null);

  useEffect(() => {
    let mounted = true;

    async function initStripe() {
      try {
        await loadStripeScript();
        if (!mounted || !window.Stripe) return;

        const stripe = window.Stripe(stripePublishableKey);
        stripeRef.current = stripe;

        const elements = stripe.elements();
        const card = elements.create("card", {
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

          card.on("ready", () => {
            if (mounted) setCardReady(true);
          });

          card.on("change", (event: { error?: { message: string } }) => {
            if (mounted) {
              setError(event.error ? event.error.message : null);
            }
          });
        }
      } catch {
        if (mounted) setError("Failed to load payment form");
      }
    }

    initStripe();

    return () => {
      mounted = false;
      cardElementRef.current?.destroy();
    };
  }, [stripePublishableKey]);

  async function handleSubscribe(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Staff/QA test card: create the membership without a real charge.
    if (testCard.trim()) {
      try {
        const t = await attemptTestMembership(planId, testCard.trim());
        if (t.created) {
          window.location.assign("/account/membership/complete-profile");
          return;
        }
        if (t.error) {
          setError(t.error);
          setLoading(false);
          return;
        }
        // Not the test card — fall through to a normal Stripe payment.
      } catch {
        /* fall through to real payment */
      }
    }

    if (!stripeRef.current || !cardElementRef.current) {
      setError("Payment form is still loading — please try again.");
      setLoading(false);
      return;
    }

    try {
      const result = await createSubscription(planId);

      if (!result.success) {
        setError(result.error || "Failed to create subscription");
        return;
      }

      if (result.clientSecret) {
        const { error: stripeError } = await stripeRef.current.confirmCardPayment(
          result.clientSecret,
          {
            payment_method: {
              card: cardElementRef.current,
            },
          }
        );

        if (stripeError) {
          setError(stripeError.message || "Payment failed");
          return;
        }
      }

      // Success — collect required business/billing details before welcome.
      // Hard navigation: router.push after a revalidating action proved
      // unreliable here, so force a full navigation.
      window.location.assign("/account/membership/complete-profile");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubscribe}>
      {error && (
        <div className="bg-sale-bg border border-sale/30 text-sale-deep p-4 mb-4 text-sm">
          {error}
        </div>
      )}

      <div className="mb-6">
        <label className="field-label mb-2">
          Card details
        </label>
        <div
          ref={cardContainerRef}
          className="border border-border px-4 py-3 bg-white focus-within:ring-2 focus-within:ring-text-primary focus-within:border-text-primary transition-shadow"
        />
      </div>

      <div className="mb-6">
        <label htmlFor="testCard" className="field-label mb-2">
          Test card (staff only — optional)
        </label>
        <input
          id="testCard"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={testCard}
          onChange={(e) => setTestCard(e.target.value)}
          placeholder="Leave blank to pay by card above"
          className="block w-full input"
        />
      </div>

      <button
        type="submit"
        disabled={loading || (!cardReady && !testCard.trim())}
        className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Processing..." : "Subscribe Now"}
      </button>

      <p className="text-xs text-text-secondary mt-4 text-center">
        By subscribing, you agree to our terms of service. You can cancel at any time.
      </p>
    </form>
  );
}
