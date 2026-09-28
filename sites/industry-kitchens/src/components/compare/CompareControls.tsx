"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useCompareList, writeCompareList } from "@/lib/compare/use-compare-list";

// The compare page's own controls. The page is server-rendered from the cookie,
// so each one rewrites the cookie and then asks for a fresh render.

/** Remove one product's column. */
export function RemoveFromCompare({ productId, name }: { productId: number; name: string }) {
  const { remove } = useCompareList();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => {
        remove(productId);
        start(() => router.refresh());
      }}
      disabled={pending}
      aria-label={`Remove ${name} from compare`}
      title="Remove"
      className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-300 text-zinc-500 hover:border-zinc-900 hover:text-zinc-900 disabled:opacity-50 print:hidden"
      data-testid="compare-remove"
    >
      <X className="h-4 w-4" />
    </button>
  );
}

/** Empty the whole list. */
export function ClearCompare() {
  const { clear } = useCompareList();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => {
        clear();
        start(() => router.refresh());
      }}
      disabled={pending}
      className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-900 hover:text-zinc-900 disabled:opacity-50 print:hidden"
      data-testid="compare-clear"
    >
      Clear all
    </button>
  );
}

/** "Print This Page" — the old compare page carried the same link. */
export function PrintCompare() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-900 hover:text-zinc-900 print:hidden"
    >
      Print this page
    </button>
  );
}

/**
 * Drops ids the page could not show (retired, hidden, or private to another
 * account) from the cookie, so the header count and the page agree. Renders
 * nothing.
 */
export function PruneCompare({ shownIds }: { shownIds: number[] }) {
  const { list } = useCompareList();
  const key = shownIds.join(",");
  useEffect(() => {
    const shown = new Set(key ? key.split(",").map(Number) : []);
    if (list.length > 0 && list.some((id) => !shown.has(id))) {
      writeCompareList(list.filter((id) => shown.has(id)));
    }
  }, [list, key]);
  return null;
}
