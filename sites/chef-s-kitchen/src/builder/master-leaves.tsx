"use client";
import { PriceBlock } from "@/components/ui/PriceBlock";
import { AddToCartButton } from "@/components/product/AddToCartButton";
import { AddToQuoteButton } from "@/components/product/AddToQuoteButton";
import { StatsBanner } from "@/components/home/StatsBanner";
import { ga4SelectItem } from "@/components/analytics/ga4";
import type { NativeComponents } from "@keenan/services/builder-react";

// ============================================================================
// The sealed native LEAVES the component masters place — the only app-tier
// widgets a master contains. Everything around them is authored tree:
//   ⬢price-block   — the shared trade PriceBlock (GST-context-reactive)
//   ⬢add-to-cart   — AddToCartButton (cart POST + toast + GA4 add_to_cart)
//   ⬢add-to-quote  — AddToQuoteButton
//   ⬢stats-banner  — the hero count-up stat card
// Register via masterLeafNatives(pricing) in every Builder*Page wrapper whose
// trees can contain product cards / the hero panel.
// ============================================================================

type LeafPricing = { isMember?: boolean; planPrice?: string | null } | null | undefined;

const num = (v: unknown): number | null => {
  const x = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(x) ? x : null;
};
const strOr = (v: unknown): string | undefined => (v == null || v === "" ? undefined : String(v));

export function masterLeafNatives(pricing?: LeafPricing): NativeComponents {
  return {
    "price-block": (props: Record<string, unknown>) => {
      const rrp = num(props.rrp);
      if (rrp == null || rrp <= 0) return null;
      return (
        <PriceBlock
          rrp={rrp}
          memberPrice={num(props.member_price)}
          isMember={pricing?.isMember}
          planPrice={pricing?.planPrice}
          size="card"
        />
      );
    },
    "add-to-cart": (props: Record<string, unknown>) => {
      const id = num(props.product_id);
      if (id == null) return null;
      return (
        <AddToCartButton
          productId={id}
          size="sm"
          productName={strOr(props.name)}
          sku={strOr(props.sku) ?? null}
          price={num(props.price) ?? undefined}
          brandName={strOr(props.brand_name)}
          categoryName={strOr(props.category_name)}
        />
      );
    },
    "add-to-quote": (props: Record<string, unknown>) => {
      const id = num(props.product_id);
      return id == null ? null : <AddToQuoteButton productId={id} size="sm" />;
    },
    "stats-banner": (props: Record<string, unknown>) => (
      <StatsBanner productCount={num(props.product_count) ?? 0} brandCount={num(props.brand_count) ?? 0} />
    ),
  };
}

/** GA4 select_item Action the product-card master's links run (parity with the
 *  native card's handleSelect — non-blocking, navigation proceeds). */
export function selectItemHandler(listId?: string, listName?: string) {
  return (args: Record<string, unknown>) => {
    ga4SelectItem(
      {
        item_id: strOr(args.sku) ?? String(args.id ?? ""),
        item_name: String(args.name ?? ""),
        item_brand: strOr(args.brand),
        price: num(args.price) ?? undefined,
        quantity: 1,
      },
      listId,
      listName
    );
    return { success: true };
  };
}
