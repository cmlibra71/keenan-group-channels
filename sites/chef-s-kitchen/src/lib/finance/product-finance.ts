// ============================================================================
// The finance offer shown on ONE product page (card 6f47rFeT).
//
// Tim, 2026-08-11: the SilverChef logo and a live weekly figure go on every
// product page on both sites, worked out from "the customer's current best
// price" — the price that shopper is actually looking at, member/contract
// price included — and SKOPE products use SKOPE's own calculator instead.
//
// WHICH products are SKOPE got wider on 2026-08-19 (Steve, same card): a SKU
// that starts with "SKOPE", and the product's BRAND, count as well as the live
// site's "SKO-" test. The brand is passed in from the route because the SKU
// alone missed 23 machines coded SKOPE-… and 76 more whose code says nothing.
//
// The RATES are this storefront's own (card 6GBlDtwf) and arrive from context;
// everything else below still holds.
//
// NOTHING IS RECALCULATED HERE. The rates, the arithmetic, the SKOPE test and
// the money formatting all come from `@keenan/services/finance`, which the
// checkout buttons (VAjaPj0t) and the quote/invoice figure (H7IJD8ym) already
// share. If this file did the multiplication itself, the product page and the
// checkout button would quote two different rents for the same trolley.
//
// TWO OFFERS, TWO LABELS — the live Industry Kitchens site quotes SilverChef as
// "Rent per Week: $X" and SKOPE Funding as "Own Me $X a week", and the checkout
// says exactly that (`lib/checkout/finance.ts weeklyBadgeForMethod`). A SKOPE
// product under the SilverChef label would quote a rent SilverChef never
// offered, so the panel changes its whole identity, not just its rate.
//
// NO $1,000 FLOOR HERE. The floor is a CHECKOUT rule (Tim, VAjaPj0t: finance
// options only over $1,000 inc GST, Afterpay below) and a quote/invoice rule
// (H7IJD8ym). On the product page Tim's ruling is the opposite — "It can show
// for all products" — so the only thing that hides the panel is having no
// price to rent.
// ============================================================================

// PURE subpaths only. `@keenan/services/services` drags the service barrel
// (ProductImageService → sharp) into the browser bundle through the panel and
// 500s the product page.
import { gstSplit } from "@keenan/services/calc";
import {
  DEFAULT_FINANCE_RATES,
  formatFinanceMoney,
  isSkopeProduct,
  rateForLine,
  weeklyRent,
  type FinanceRates,
} from "@keenan/services/finance";

/** Which funder is quoting, so the panel can wear the right identity. */
export type ProductFinanceFunder = "silverchef" | "skope";

export interface ProductFinanceOffer {
  funder: ProductFinanceFunder;
  /** Weekly rent, GST inclusive, 2dp — straight from @keenan/services/finance. */
  weekly: number;
  /** The formatted amount on its own, e.g. "$641.99". */
  amount: string;
  /** The whole phrase in that funder's words — "Rent per Week: $641.99". */
  text: string;
  /** The price the figure was worked out from, GST inclusive. */
  priceIncGst: number;
}

export interface ProductPriceInput {
  /** The product/variant's list price, in the store's own tax basis. */
  displayPrice: number;
  /** Its sale price, when one is set. */
  displaySalePrice?: number | null;
  /** This shopper's member or per-account contract price, when they have one. */
  memberPrice?: number | null;
}

/**
 * The price THIS shopper is looking at, in the store's own tax basis.
 *
 * Deliberately the same ladder the buy box uses (`useProductPageScope`:
 * `rrpBase = salePrice ?? price`, then the member price when it actually beats
 * it) so the rent is quoted off the number printed a centimetre above it. A
 * member price that is not cheaper is ignored rather than trusted, exactly as
 * `hasSave` does — otherwise a stale contract price above RRP would quote a
 * rent higher than the price on the page.
 */
export function bestVisiblePrice(input: ProductPriceInput): number {
  const rrpBase = input.displaySalePrice ?? input.displayPrice;
  if (!Number.isFinite(rrpBase) || rrpBase <= 0) return 0;
  const member = input.memberPrice;
  if (member != null && Number.isFinite(member) && member > 0 && member < rrpBase) return member;
  return rrpBase;
}

/**
 * The panel's whole content for one product, or null when there is nothing to
 * quote.
 *
 * `pricesIncludeTax` is the CHANNEL's basis, not the shopper's ex/inc GST
 * toggle: customer-facing finance money is GST-inclusive whatever the toggle
 * says (Product Brief §3), so flipping the switch must not move the weekly
 * figure. GST goes through `gstSplit` — the `× 1.1` is never re-typed at a call
 * site (services D4).
 */
export function productFinanceOffer(input: {
  price: ProductPriceInput;
  /** The SKU actually being bought — the VARIANT's when one is chosen. */
  sku?: string | null;
  /**
   * The product's brand name, where the route holds one (it always does on a
   * product page). Half of the SKOPE test since Steve widened it on 2026-08-19:
   * a SKOPE-branded fridge whose code says nothing still rents at SKOPE's
   * factor. Omitted ⇒ the SKU decides on its own, which is the old behaviour.
   */
  brand?: string | null;
  pricesIncludeTax: boolean;
  /**
   * This storefront's own rates (card 6GBlDtwf), from `useFinanceRates()`. They
   * MUST be the same pair the checkout button uses, or the shopper meets two of
   * our own controls quoting different rents for one product. Defaulted to the
   * shipped rates so a caller without the provider behaves as it always did.
   */
  rates?: FinanceRates;
}): ProductFinanceOffer | null {
  const rates = input.rates ?? DEFAULT_FINANCE_RATES;
  const visible = bestVisiblePrice(input.price);
  if (visible <= 0) return null;

  const priceIncGst = gstSplit(visible, input.pricesIncludeTax).incTax;
  // The rate CHOICE is the services module's too (`rateForLine` reads the SKU),
  // so "which products are SKOPE" has one answer across cart, checkout and page.
  const weekly = weeklyRent(
    priceIncGst,
    rateForLine({ amountIncGst: priceIncGst, sku: input.sku, brand: input.brand }, rates)
  );
  if (weekly <= 0) return null;

  const funder: ProductFinanceFunder = isSkopeProduct({ sku: input.sku, brand: input.brand })
    ? "skope"
    : "silverchef";
  const amount = formatFinanceMoney(weekly);
  return {
    funder,
    weekly,
    amount,
    text: funder === "skope" ? `Own Me ${amount} a week` : `Rent per Week: ${amount}`,
    priceIncGst,
  };
}
