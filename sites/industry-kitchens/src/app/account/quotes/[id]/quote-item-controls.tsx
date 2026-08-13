"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, X } from "lucide-react";
import { updateAccountQuoteItem, removeAccountQuoteItem } from "@/lib/actions/quote";

/**
 * How long the stepper waits after the LAST click before it saves.
 *
 * Clicking + fifteen times is one decision, not fifteen — and one save, not
 * fifteen. Same debounce as the emailed quote's row (portal
 * `q/[uuid]/_components/customer-item-row.tsx`), so a customer dialling in a
 * realistic quantity does not fire a request per click.
 */
const SAVE_DEBOUNCE_MS = 600;

export function QuoteItemControls({
  quoteId,
  itemId,
  quantity,
}: {
  quoteId: number;
  itemId: number;
  quantity: number;
}) {
  const router = useRouter();
  const [qty, setQty] = useState(quantity);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The server row is the truth: after a save the page re-renders and this must
  // follow it, or a refused change would stay on screen looking accepted.
  useEffect(() => setQty(quantity), [quantity]);

  const saveQty = useCallback(
    (next: number) => {
      startTransition(async () => {
        const res = await updateAccountQuoteItem(quoteId, itemId, next);
        if ("error" in res) {
          setError(res.error);
          setQty(quantity);
          return;
        }
        router.refresh();
      });
    },
    [quoteId, itemId, quantity, router]
  );

  function step(next: number) {
    if (next < 1 || next === qty) return;
    setQty(next);
    setError(null);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveQty(next), SAVE_DEBOUNCE_MS);
  }

  function remove() {
    setError(null);
    // A queued quantity save for a line that is about to go would arrive after
    // the delete and fail.
    if (saveTimer.current) clearTimeout(saveTimer.current);
    startTransition(async () => {
      const res = await removeAccountQuoteItem(quoteId, itemId);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  return (
    <div className="mt-2">
      <div className="inline-flex items-center gap-1">
        <button
          type="button"
          disabled={isPending || qty <= 1}
          onClick={() => step(qty - 1)}
          className="rounded border border-zinc-200 p-1 text-zinc-600 hover:bg-zinc-50 disabled:opacity-40"
          aria-label="Decrease quantity"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="min-w-[3ch] text-center text-sm text-zinc-900">{qty}</span>
        <button
          type="button"
          disabled={isPending}
          onClick={() => step(qty + 1)}
          className="rounded border border-zinc-200 p-1 text-zinc-600 hover:bg-zinc-50 disabled:opacity-40"
          aria-label="Increase quantity"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={remove}
          className="ml-2 inline-flex items-center gap-1 rounded p-1 text-xs text-zinc-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
          aria-label="Remove item"
        >
          <X className="h-3.5 w-3.5" />
          Remove
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
