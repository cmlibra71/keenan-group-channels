import { tileControlsOf, tileButtons } from "@keenan/services/tile-controls";
import { cardPrice } from "./card-price";

// ============================================================================
// Which buy controls a REACT listing tile (search, clearance) draws — IK parity, product cards.
//
// The Site Builder tile (`product-card` master) decides the same thing with expressions over the
// enriched row (`answer_required`, `from_price`, `cart_refused`, `quote_refused`, `out_of_stock`,
// `rrp_num`); this is that rule for the React `ProductGrid`, so the two tiles cannot disagree:
//
//   * a CONFIGURABLE product (it prices "Starting From") or one that asks a REQUIRED question
//     (`answerRequired`, services `attachTileFacts`) cannot be added from a tile — Zoey sends the
//     shopper to the product page ("View Details" on a category tile; "View Product" plus an
//     "Add to Quote" LINK on a search tile);
//   * otherwise Add to Quote unless the product refuses quotes, and Add to Basket when the product
//     is priced, not refused (restrict flag, Zoey quote-only switch, per-channel rule) and not
//     switched off.
//
// Old site, 2026-09-28 (guest): 478 of 487 category tiles match this rule; the 9 that do not are
// data gaps listed in the Step 5 report (stale stock flags, one un-imported required option).
//
// The cart action refuses anything this lets through by mistake (rules, missing answers) and
// sends the shopper to the product page — this only decides what is DRAWN. Pure.
// ============================================================================

export interface TileBuyRow {
  price: string | number | null;
  salePrice?: string | number | null;
  fromPrice?: string | number | null;
  fromSalePrice?: string | number | null;
  availability?: string | null;
  answerRequired?: boolean;
  answer_required?: boolean;
  restrictAddToCart?: unknown;
  restrictAddToQuote?: unknown;
  purchasingDisabled?: unknown;
}

export interface TileBuyFacts {
  /** The tile sends the shopper to the product page instead of adding. */
  viewDetails: boolean;
  /** Add to Basket may be drawn. */
  cart: boolean;
  /** Add to Quote may be drawn (a button, or — on a View Details search tile — a link). */
  quote: boolean;
}

export function tileBuyFacts(row: TileBuyRow): TileBuyFacts {
  const price = cardPrice({ price: row.price, salePrice: row.salePrice, fromPrice: row.fromPrice, fromSalePrice: row.fromSalePrice });
  const viewDetails = price.from || row.answerRequired === true || row.answer_required === true;
  const controls = tileControlsOf(row);
  const buttons = tileButtons(controls, price.list > 0, row.availability === "disabled");
  return {
    viewDetails,
    cart: !viewDetails && buttons.cart,
    quote: buttons.quote,
  };
}
