import { displaySalePrice } from "@keenan/services/catalog-price";

/**
 * What an Industry Kitchens listing TILE (`ProductCard`) prints — the React twin of the services
 * `enrichProductCardRows` rule the Site Builder tiles use, so the two tiles cannot disagree.
 *
 *   * A configurable row carrying a "Starting From" figure (`attachFromPrices`, services #182)
 *     prices from it and says "Starting From:" — never "Call for Price" on a $0 parent.
 *   * A sale is shown only when 0 < sale < price and the two print differently to the cent
 *     (`displaySalePrice`, display only — sub-cent Zoey imports such as 3681.8210 / 3681.82 print
 *     one price) — the IK parity root cause
 *     sale-not-below-price: a `salePrice` merely being present used to strike the price through
 *     even when it was equal to or above it.
 *
 * Pure, so it is unit-tested (`card-price.test.ts`).
 */
export interface CardPriceInput {
  price: string | number | null | undefined;
  salePrice?: string | number | null;
  fromPrice?: string | number | null;
  fromSalePrice?: string | number | null;
}

export interface CardPrice {
  /** The list price the tile prints (struck through when `sale` is set). 0 = "Call for Price". */
  list: number;
  /** A real sale price, or null. */
  sale: number | null;
  /** True when the figures are the configurable's "Starting From" price. */
  from: boolean;
}

function money(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

export function cardPrice(input: CardPriceInput): CardPrice {
  const fromList = money(input.fromPrice);
  if (fromList > 0) {
    return { list: fromList, sale: displaySalePrice(fromList, input.fromSalePrice ?? null), from: true };
  }
  const list = money(input.price);
  return { list, sale: displaySalePrice(list, input.salePrice ?? null), from: false };
}
