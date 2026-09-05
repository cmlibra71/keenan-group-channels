"use client";

import { useTransition, useOptimistic } from "react";
import { useRouter } from "next/navigation";
import { updateQuoteItem, removeQuoteItem } from "@/lib/actions/quote";
import { useCartQuoteCounts } from "@/lib/cart-quote-counts";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Price } from "@/components/ui/Price";
import { packNote as packNoteFor, resolvePackSize } from "@keenan/services/pack";

// QuoteService returns snake_case rows (transformRow convention).
export type QuoteItemRow = {
  id: number;
  product_id: number;
  variant_id: number | null;
  quantity: number;
  list_price: string | null;
  sale_price: string | null;
  extended_list_price: string | null;
  extended_sale_price: string | null;
  customer_notes: string | null;
  product_name: string;
  product_slug: string | null;
  product_sku: string | null;
  variant_sku: string | null;
  variant_option_name: string | null;
  /**
   * The SELLING UNIT of this line's product (cards O108e4jH / zeMPVcA3), selected onto every line
   * by `QuoteService.getWithItems`. The server rounds a typed quantity UP to whole packs, so this
   * screen has to SAY what a pack holds — a customer who asks for 20 and is handed 24 with nothing
   * on screen explaining it has been given wrong customer-visible wording, which is the one thing
   * we may not guess at. NULL on nearly every product, and then this row is exactly as it was.
   */
  product_sell_pack_size?: number | null;
  product_sell_pack_unit?: string | null;
};

export function QuoteItemsList({ items, onMutate }: { items: QuoteItemRow[]; onMutate?: () => void }) {
  return (
    <div className="divide-y divide-zinc-200">
      {items.map((item) => (
        <QuoteItemRow key={item.id} item={item} onMutate={onMutate} />
      ))}
    </div>
  );
}

function QuoteItemRow({ item, onMutate }: { item: QuoteItemRow; onMutate?: () => void }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { setQuoteCount } = useCartQuoteCounts();
  // Instant on click; auto-reverts to the prop if the transition ends without
  // fresh items (error → refresh self-heal).
  const [displayQty, setDisplayQty] = useOptimistic(item.quantity);
  // 1 on everything nobody has marked as sold by the carton, which is the +1 / -1 this row has
  // always done.
  const packSize = resolvePackSize({ sellPackSize: item.product_sell_pack_size ?? null });
  const packNote = packNoteFor({
    sellPackSize: item.product_sell_pack_size ?? null,
    sellPackUnit: item.product_sell_pack_unit ?? null,
  });

  const unitPrice = item.sale_price
    ? parseFloat(item.sale_price)
    : parseFloat(item.list_price ?? "");
  const lineTotal = unitPrice * displayQty;
  // Zero-priced lines are price-on-application — the sales team quotes them.
  const isPoa = !Number.isFinite(unitPrice) || unitPrice <= 0;

  function handleQuantity(newQty: number) {
    startTransition(async () => {
      setDisplayQty(Math.max(0, newQty));
      // Never let a thrown action escape the transition (it would kill the click
      // and can escalate to the error boundary). On failure, refresh to re-sync.
      try {
        const res = await updateQuoteItem(item.id, newQty);
        if (res?.error) {
          router.refresh();
          return;
        }
        // Fresh count from the action → header badge updates in place.
        if (typeof res?.quoteCount === "number") setQuoteCount(res.quoteCount);
        await onMutate?.();
      } catch {
        router.refresh();
      }
    });
  }

  function handleRemove() {
    startTransition(async () => {
      try {
        const res = await removeQuoteItem(item.id);
        if (res?.error) {
          router.refresh();
          return;
        }
        if (typeof res?.quoteCount === "number") setQuoteCount(res.quoteCount);
        await onMutate?.();
      } catch {
        router.refresh();
      }
    });
  }

  return (
    <div className={`py-4 flex items-center gap-4 ${isPending ? "opacity-50" : ""}`}>
      <div className="flex-1 min-w-0">
        <a
          href={item.product_slug ? `/products/${item.product_slug}` : "#"}
          className="text-sm font-medium text-zinc-900 hover:underline truncate block"
        >
          {item.product_name}
        </a>
        {item.variant_option_name && (
          <p className="text-xs text-zinc-500 mt-0.5">{item.variant_option_name}</p>
        )}
        <p className="text-xs text-zinc-400 mt-0.5">
          SKU: {item.variant_sku || item.product_sku || "N/A"}
        </p>
        <p className="text-sm text-zinc-600 mt-1">{isPoa ? (
            <span className="inline-block bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded text-xs font-medium">Requires quote</span>
          ) : <><Price amount={unitPrice} /> each</>}</p>
        {packNote && (
          <p className="text-xs text-zinc-600 mt-0.5">{packNote}</p>
        )}
      </div>

      {/* Quantity controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => handleQuantity(item.quantity - packSize)}
          disabled={isPending}
          className="h-8 w-8 flex items-center justify-center rounded border border-zinc-300 text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
        >
          <Minus className="h-3 w-3" />
        </button>
        <span className="min-w-8 px-1 text-center text-sm font-medium">{displayQty}</span>
        <button
          onClick={() => handleQuantity(item.quantity + packSize)}
          disabled={isPending}
          className="h-8 w-8 flex items-center justify-center rounded border border-zinc-300 text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {/* Line total */}
      <div className="w-24 text-right">
        {isPoa ? <span className="text-sm font-semibold text-zinc-900">&mdash;</span> : <Price amount={lineTotal} className="text-sm font-semibold text-zinc-900" />}
      </div>

      {/* Remove */}
      <button
        onClick={handleRemove}
        disabled={isPending}
        className="text-zinc-400 hover:text-red-600 disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
