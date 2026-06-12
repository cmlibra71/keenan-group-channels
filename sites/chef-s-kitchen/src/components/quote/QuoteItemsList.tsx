"use client";

import { useTransition } from "react";
import { updateQuoteItem, removeQuoteItem } from "@/lib/actions/quote";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Price } from "@/components/ui/Price";

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
};

export function QuoteItemsList({ items, onMutate }: { items: QuoteItemRow[]; onMutate?: () => void }) {
  return (
    <div className="divide-y divide-border">
      {items.map((item) => (
        <QuoteItemRow key={item.id} item={item} onMutate={onMutate} />
      ))}
    </div>
  );
}

function QuoteItemRow({ item, onMutate }: { item: QuoteItemRow; onMutate?: () => void }) {
  const [isPending, startTransition] = useTransition();

  const unitPrice = item.sale_price
    ? parseFloat(item.sale_price)
    : parseFloat(item.list_price ?? "");
  const lineTotal = unitPrice * item.quantity;
  // Zero-priced lines are price-on-application — the sales team quotes them.
  const isPoa = !Number.isFinite(unitPrice) || unitPrice <= 0;

  function handleQuantity(newQty: number) {
    startTransition(async () => {
      await updateQuoteItem(item.id, newQty);
      onMutate?.();
    });
  }

  function handleRemove() {
    startTransition(async () => {
      await removeQuoteItem(item.id);
      onMutate?.();
    });
  }

  return (
    <div className={`py-4 flex items-center gap-4 ${isPending ? "opacity-50" : ""}`}>
      <div className="flex-1 min-w-0">
        <a
          href={item.product_slug ? `/products/${item.product_slug}` : "#"}
          className="text-sm font-medium text-text-primary hover:underline truncate block"
        >
          {item.product_name}
        </a>
        {item.variant_option_name && (
          <p className="text-xs text-text-secondary mt-0.5">{item.variant_option_name}</p>
        )}
        <p className="text-xs text-text-muted mt-0.5">
          SKU: {item.variant_sku || item.product_sku || "N/A"}
        </p>
        <p className="text-sm text-text-secondary mt-1">{isPoa ? (
            <span className="inline-block bg-member-bg text-member-text border border-member/40 px-2 py-0.5 rounded text-xs font-medium">Requires quote</span>
          ) : <><Price amount={unitPrice} /> each</>}</p>
      </div>

      {/* Quantity controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => handleQuantity(item.quantity - 1)}
          disabled={isPending}
          className="h-8 w-8 flex items-center justify-center border border-border text-text-secondary hover:bg-surface-secondary disabled:opacity-50"
        >
          <Minus className="h-3 w-3" />
        </button>
        <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
        <button
          onClick={() => handleQuantity(item.quantity + 1)}
          disabled={isPending}
          className="h-8 w-8 flex items-center justify-center border border-border text-text-secondary hover:bg-surface-secondary disabled:opacity-50"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {/* Line total */}
      <div className="w-24 text-right">
        {isPoa ? <span className="text-sm font-semibold text-text-primary">&mdash;</span> : <Price amount={lineTotal} className="text-sm font-semibold text-text-primary" />}
      </div>

      {/* Remove */}
      <button
        onClick={handleRemove}
        disabled={isPending}
        className="text-text-muted hover:text-sale disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" strokeWidth={1.5} />
      </button>
    </div>
  );
}
