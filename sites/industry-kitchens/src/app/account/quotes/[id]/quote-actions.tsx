"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptQuote, duplicateQuote } from "@/lib/actions/quote";
import type { QuoteAcceptState } from "@/lib/quotes/price-visibility";

export function QuoteActions({
  quoteId,
  status,
  acceptState,
}: {
  quoteId: number;
  status: string;
  /** Resolved server-side (same rule the accept action enforces). */
  acceptState: QuoteAcceptState;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const canDuplicate = !["quote_cancelled"].includes(status);

  const run = (
    fn: () => Promise<{ success?: boolean; error?: string; quoteId?: number }>,
    okText: string,
    goTo?: (r: { quoteId?: number }) => string,
  ) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (r?.error) {
        setMsg({ kind: "err", text: r.error });
      } else {
        setMsg({ kind: "ok", text: okText });
        if (goTo && r?.quoteId) router.push(goTo(r));
        else router.refresh();
      }
    });

  if (acceptState.kind === "hidden" && !canDuplicate) return null;

  return (
    <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-6">
      {acceptState.kind === "enabled" && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              () => acceptQuote(quoteId),
              // Accepting without paying sends the pro-forma (card 0Wy0xHuq) —
              // say so, or the customer waits for something they think is coming.
              "Quote accepted — we've emailed your pro-forma. You can pay it below."
            )
          }
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Working…" : "Accept quote"}
        </button>
      )}
      {/* Not acceptable yet: the button stays on screen, greyed and inert, carrying
          the reason on hover — rather than vanishing and leaving the customer
          hunting for it. Mirrors the portal's gated-button treatment: aria-disabled
          + pointer-events-none (so hover still reaches the wrapper and fires the
          tooltip) rather than the native `disabled` attribute. */}
      {acceptState.kind === "disabled" && (
        <span
          className="group relative inline-flex cursor-not-allowed"
          title={acceptState.reason}
        >
          <button
            type="button"
            aria-disabled="true"
            tabIndex={-1}
            className="pointer-events-none rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white opacity-50"
          >
            Accept quote
          </button>
          <span
            role="tooltip"
            className="pointer-events-none invisible absolute bottom-full left-1/2 z-50 mb-2 block w-max max-w-xs -translate-x-1/2 rounded-md bg-zinc-900 px-3 py-2 text-xs text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:visible group-hover:opacity-100"
          >
            {acceptState.reason}
          </span>
        </span>
      )}
      {canDuplicate && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(() => duplicateQuote(quoteId), "Duplicated", (r) => `/account/quotes/${r.quoteId}`)
          }
          className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
        >
          Duplicate
        </button>
      )}
      {msg && (
        <span className={`text-sm ${msg.kind === "ok" ? "text-zinc-500" : "text-red-600"}`}>{msg.text}</span>
      )}
    </div>
  );
}
