"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tag, X } from "lucide-react";
import { applyCouponCode, removeCouponCode } from "@/lib/actions/cart";

/**
 * The offer panel on /cart (card p6YVxc4P).
 *
 * Two jobs, and they are separate on purpose:
 *
 *  - It says how many more cartons reach the next band, and it says when a
 *    basket is big enough that the answer is a quote rather than a percentage.
 *    Those sentences come from the SHARED engine, not from copy written here, so
 *    the product page's tier table and this message can never disagree.
 *  - It is the only place on either storefront a promotion code can be entered.
 *    Before this card the cart CARRIED codes (`carts.coupon_codes`) and
 *    `placeOrder` redeemed them with a $0 discount, but no screen could set one
 *    — a win-back coupon had nowhere to be typed.
 *
 * A code that discounts nothing is refused by the server and the shopper is told
 * here, not at the till.
 */
export function CartOffers({
  messages,
  couponCodes,
  onMutate,
}: {
  messages: { kind: string; text: string }[];
  couponCodes: string[];
  onMutate?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const entered = code.trim();
    if (!entered) return;
    setError(null);
    startTransition(async () => {
      const result = await applyCouponCode(entered);
      if (result.error) {
        setError(result.error);
        return;
      }
      setCode("");
      await onMutate?.();
      router.refresh();
    });
  }

  function drop(applied: string) {
    setError(null);
    startTransition(async () => {
      await removeCouponCode(applied);
      await onMutate?.();
      router.refresh();
    });
  }

  const progress = messages.filter((m) => m.kind === "tier_progress" || m.kind === "cross_range");
  const quoteAsks = messages.filter((m) => m.kind === "request_quote");
  const applied = messages.filter((m) => m.kind === "applied");

  return (
    <div className="rounded-lg border border-zinc-200 p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900">
        <Tag className="h-4 w-4 text-zinc-400" /> Offers
      </h2>

      {applied.map((m) => (
        <p key={m.text} className="mb-2 text-sm font-medium text-green-700">
          {m.text}
        </p>
      ))}
      {progress.map((m) => (
        <p key={m.text} className="mb-2 text-sm text-zinc-600">
          {m.text}
        </p>
      ))}
      {quoteAsks.map((m) => (
        <p key={m.text} className="mb-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-sm text-amber-900">
          {m.text}{" "}
          <a href="/request-quote" className="font-medium underline">
            Request a quote
          </a>
        </p>
      ))}

      {couponCodes.length > 0 && (
        <ul className="mb-3 space-y-1">
          {couponCodes.map((applied) => (
            <li key={applied} className="flex items-center justify-between text-sm">
              <span className="font-medium text-green-700">{applied}</span>
              <button
                type="button"
                onClick={() => drop(applied)}
                disabled={isPending}
                aria-label={`Remove promotion code ${applied}`}
                className="text-zinc-400 hover:text-red-600 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="flex gap-2">
        <label htmlFor="promotion-code" className="sr-only">
          Promotion code
        </label>
        <input
          id="promotion-code"
          name="promotion-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Promotion code"
          autoComplete="off"
          className="min-w-0 flex-1 rounded border border-zinc-300 px-3 py-2 text-sm uppercase placeholder:normal-case focus:border-zinc-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={isPending || code.trim() === ""}
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          Apply
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
