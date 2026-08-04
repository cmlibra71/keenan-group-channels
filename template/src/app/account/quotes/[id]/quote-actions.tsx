"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptQuote, duplicateQuote } from "@/lib/actions/quote";

export function QuoteActions({ quoteId, status }: { quoteId: number; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const canAccept = ["quote_available", "open_change_request"].includes(status);
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

  if (!canAccept && !canDuplicate) return null;

  return (
    <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-6">
      {canAccept && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => acceptQuote(quoteId), "Quote accepted")}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Working…" : "Accept quote"}
        </button>
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
