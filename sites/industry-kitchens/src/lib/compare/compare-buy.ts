import { canPurchaseQuantity } from "@keenan/services/backorder";
import { channelRuleEffects, type ChannelPurchaseRules, type ChannelRuleViewer } from "@keenan/services/channel-rules";
import { tileControlsOf } from "@keenan/services/tile-controls";
import type { ProductKit } from "@/lib/product-kit";

// ============================================================================
// Which buy buttons a compare column offers — THE PRODUCT PAGE'S decision, not
// the listing tile's (independent review of PR #309: the tile rule put Add to
// Cart on "Hoshizaki KMD-270AB … - BUNDLE", whose own page offers Add to Quote
// only).
//
// The product page's cart control is offered when (services
// `product-page/bridge.tsx` `cartOffered`, plus the route's own overrides):
//   * the shopper is shown a price — a HIDDEN price (`hide_price`) is masked to 0
//     by the purchase provider, so it takes the cart away with the figure;
//   * nothing on the product refuses the cart: `restrict_add_to_cart`, Zoey's
//     quote-only switch (`purchasing_disabled`, via `tileControlsOf`), or the
//     "do not sell when out of stock" setting at quantity 1
//     (`canPurchaseQuantity`, the provider's `purchaseBlockedByStock`);
//   * it is not a BUNDLE. A quote-only scoped kit switches the cart off on the
//     node page (`BuilderProductPage` `kitQuoteOnly`), and the fallback renderer
//     (`ProductDetail`) never offers a cart on any bundle — "a bundle is never
//     bought straight off the page, the configuration goes to a rep". Both are
//     honoured: no bundle gets a cart here.
//   * this storefront's Zoey rules do not refuse it for THIS viewer (services channel-rules, the ONE
//     reader the product page, tiles and the cart guard use): quote_only ($0 / POA — also hides the
//     price), cart_disabled (no basket for anyone, price shown), out_of_stock, and guest_quote_only
//     for a guest.
// Add to Quote is offered unless `restrict_add_to_quote` (`quoteOffered`) — or the product is Zoey
// OUT OF STOCK: the compare column copies Zoey's TILE, which shows no button at all for it.
//
// PURE apart from the two pure services helpers; pinned by compare-buy.test.ts.
// The server's own cart refusal is separate work and is not duplicated here.
// ============================================================================

export interface CompareBuyFacts {
  /** The price the column prints (0 = Call for Price). */
  shownPrice: number;
  hidePrice: boolean;
  restrictAddToCart?: boolean | null;
  restrictAddToQuote?: boolean | null;
  purchasingDisabled?: boolean | null;
  inventoryTracking?: string | null;
  inventoryLevel?: number | null;
  backorderPolicy?: string | null;
  kit: Pick<ProductKit, "kind" | "quoteOnly"> | null;
  /**
   * The REQUIRED questions this product asks on this channel, default or not (services
   * `tileRequiredQuestions`). Any at all ⇒ the column opens the product page instead of offering
   * buttons, as Zoey's tile does (the page still starts on the default). Absent ⇒ none.
   */
  requiredQuestions?: readonly string[] | null;
  /** This storefront's Zoey rules for the product (`readChannelRules(metafields, CHANNEL_ID)`). */
  channelRules?: ChannelPurchaseRules | null;
  /** Who is looking — the guest rule depends on it. Absent reads as a guest (as the cart guard does). */
  viewer?: ChannelRuleViewer | null;
}

export interface CompareBuy {
  cart: boolean;
  quote: boolean;
  /** The column prints "Call for Price" whatever the row's figure — the page masks a hidden price. */
  priceHidden: boolean;
  /**
   * The product asks a required question (default or not): the column shows "View Details" to
   * the product page and NO Add to Cart / Add to Quote — Zoey's tile, 100% parity.
   */
  answerRequired: boolean;
}

export function compareBuyButtons(f: CompareBuyFacts): CompareBuy {
  const controls = tileControlsOf({
    restrictAddToCart: f.restrictAddToCart,
    restrictAddToQuote: f.restrictAddToQuote,
    purchasingDisabled: f.purchasingDisabled,
  });
  const rules = channelRuleEffects(f.channelRules ?? null, f.viewer ?? null);
  const priceHidden = f.hidePrice || rules.priceHidden;
  const hasPrice = !priceHidden && f.shownPrice > 0;
  const blockedByStock = !canPurchaseQuantity(
    {
      inventoryTracking: f.inventoryTracking ?? null,
      inventoryLevel: f.inventoryLevel ?? null,
      backorderPolicy: f.backorderPolicy ?? null,
    },
    1
  );
  const isBundle = f.kit?.kind === "bundle" || f.kit?.quoteOnly === true;
  const answerRequired = (f.requiredQuestions?.length ?? 0) > 0;
  return {
    cart: hasPrice && !controls.cartRefused && !rules.cartRefused && !blockedByStock && !isBundle && !answerRequired,
    // Zoey's out-of-stock TILE shows no button at all, and the compare column is a tile: no Add to
    // Quote either (services `applyChannelRulesToTileRows` / `tileControlsOf` read it the same way).
    quote: !controls.quoteRefused && !answerRequired && f.channelRules?.outOfStock !== true,
    priceHidden,
    answerRequired,
  };
}
