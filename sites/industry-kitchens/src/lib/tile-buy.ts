import { tileControlsOf, tileButtons } from "@keenan/services/tile-controls";
import { channelRulesOfRow } from "@keenan/services/channel-rules";
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
//     switched off;
//   * a product Zoey marks OUT OF STOCK (stock managed, is_in_stock 0) and a GROUPED product show
//     no button at all (services `tileControlsOf` refuses the quote for the first; the second is
//     decided here from `zoeyType`).
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
  /** Zoey product type when not simple (services `attachTileFacts`). */
  zoeyType?: string | null;
  /** This storefront's Zoey rules, when the row still carries them (clearance rows). */
  channelRules?: unknown;
  /** The derived out-of-stock fact, on rows whose rules were already folded (search). */
  zoeyOutOfStock?: boolean;
  /** The derived "Zoey says no basket" fact (cart flag No → `cart_disabled`), on rows whose rules were
   *  already folded (search) — services `applyChannelRulesToTileRows`. */
  zoeyCartDisabled?: boolean;
  /** services `attachTileFacts`: a $0 product Zoey prices through its required option — "yes" means
   *  Zoey offers it for sale (the SKOPE warranty), "no" means no basket (Industry Kitchens only). */
  zeroPriceLift?: "yes" | "no" | string;
  /** services `attachTileFacts`: this row follows Zoey's tile button rule (Industry Kitchens only). */
  zoeyTileButtons?: boolean;
  /** services `applyChannelRulesToTileRows`: ZERO PRICE is the only reason this row's basket is refused. */
  cartRefusedByZeroPriceOnly?: boolean;
}

export interface TileBuyFacts {
  /** The tile sends the shopper to the product page instead of adding. */
  viewDetails: boolean;
  /** Add to Basket may be drawn. */
  cart: boolean;
  /** Add to Quote may be drawn (a button, or — on a View Details search tile — a link). */
  quote: boolean;
}

const NO_BUTTONS: TileBuyFacts = { viewDetails: false, cart: false, quote: false };

export function tileBuyFacts(row: TileBuyRow): TileBuyFacts {
  // A GROUPED Zoey product's tile carries no action at all (I-Fresh Sample Pack, old site).
  if (typeof row.zoeyType === "string" && row.zoeyType.toLowerCase() === "grouped") return NO_BUTTONS;
  // Out of stock in Zoey (stock managed, is_in_stock 0): no action at all, not even View Details.
  if (row.zoeyOutOfStock === true || channelRulesOfRow(row)?.outOfStock === true) return NO_BUTTONS;
  const price = cardPrice({ price: row.price, salePrice: row.salePrice, fromPrice: row.fromPrice, fromSalePrice: row.fromSalePrice });
  const controls = tileControlsOf(row);
  // Zoey's tile puts "View Product" IN PLACE OF Add to Basket: a product that asks a required
  // question but that Zoey will not sell online (cart flag No, a $0 quote-only product, stock, a
  // guest rule) shows just Add to Quote. The $0 product Zoey DOES sell through its required option
  // (`zeroPriceLift: "yes"`, the SKOPE warranty) keeps View Product. IK rows only
  // (`zoeyTileButtons`, stamped by services `attachTileFacts` for channel 1). Old site, guest,
  // 2026-09-30: Benxon lids ×5 and Polar GE632-A → ADD TO QUOTE only; SKOPE → VIEW PRODUCT + ADD TO QUOTE.
  //
  // The lift exempts ONLY the zero-price reason (money judge round 3): a search row says so with
  // `cartRefusedByZeroPriceOnly` (its rules arrive folded into `restrictAddToCart`); a clearance row
  // still carrying its rules object is lifted inside `tileControlsOf`. Any other refusal — a guest
  // rule, stock, the cart flag, a staff restriction, availability switched off — keeps quote only.
  const zoeyNoBasket =
    row.zoeyCartDisabled === true || channelRulesOfRow(row)?.cartDisabled === true || row.zeroPriceLift === "no";
  const zeroPriceOnlyExempt = row.zeroPriceLift === "yes" && row.cartRefusedByZeroPriceOnly === true;
  const basketRefused =
    zoeyNoBasket || row.availability === "disabled" || (controls.cartRefused && !zeroPriceOnlyExempt);
  const asksQuestion = row.answerRequired === true || row.answer_required === true;
  const viewDetails = price.from || (asksQuestion && !(row.zoeyTileButtons === true && basketRefused));
  const buttons = tileButtons(controls, price.list > 0, row.availability === "disabled");
  return {
    viewDetails,
    cart: !viewDetails && buttons.cart,
    quote: buttons.quote,
  };
}
