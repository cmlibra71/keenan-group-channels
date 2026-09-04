// ============================================================================
// Chefs Depot's prices and the spend-more-save-more ladder, as the product page
// needs them (card Nyp8bkPm; Tim's model, approved on the board 2026-08-24).
//
// One SKU, four figures:
//
//   RRP            the channel's catalogue price
//   Mates Rates    M — the Industry Kitchens trade price the buying-group model
//                  advertises to a logged-out visitor
//   Member price   this shopper's own price at their rung of the ladder
//   Deepest price  the top rung's price — the card's "GMC / top-tier discount
//                  price", and the deep end of the range the widget draws
//
// THE RANGE IS PUBLISHED IN DOLLARS, NOT PERCENT. The card asks for "the min and
// max discount available, based on spend". Both ends are PRICES, read from the
// same engine at the first and last configured rungs, so the widget can name
// them for the SKU on screen without deriving a percentage from a spread it has
// not measured. Entry price is where member pricing starts; deepest price is
// where it ends.
//
// ONE CAVEAT ON BASIS, and it is latent rather than live: `rrp` comes from
// `products.price` while the ladder figures come from `cd_sku_prices`, and both
// are ex GST on every channel today. If a channel ever set `pricesIncludeTax`,
// `adjustForGst` would treat the two identically and they would no longer be on
// the same basis. No channel sets it; the panel would need splitting first.
//
// NOTHING IS CALCULATED HERE, AND NOTHING IS CALCULATED IN THE SERVER HALF
// EITHER. Every figure comes out of the ONE ladder engine card gk23c1VK built —
// `@keenan/services/member-ladder` for the arithmetic and `priceVariantsAtLevel`
// for the read — which is the same engine `PricingEngine` lays over the cart,
// the quote and the order through `applyLadderPrice`. A second implementation is
// how one machine ends up with two prices on two of our own screens, which is
// exactly what the SilverChef panel is fenced off against.
//
// PURE SUBPATH ONLY. This module is read by the sealed CLIENT native, so it may
// import `@keenan/services/member-ladder` (arithmetic, no I/O) and nothing else
// from the package. The database reads live in `cd-member-pricing.server.ts`.
//
// NO SAVING PERCENTAGE, ANYWHERE. The M-to-R spread differs SKU by SKU, so this
// system has no single discount percentage and cannot be made to produce one.
// Tim's pack forbids publishing any percentage until the spread distribution has
// been measured across the catalogue, and it is explicit that the front end
// renders NOTHING rather than guess. What the widget shows instead is what the
// data DOES support: the two ends of the range as prices, where the shopper sits
// between them, and how many dollars of further rolling twelve-month spend reach
// the next rung.
// ============================================================================

/** One rung, as the widget draws it. Comes from the channel's stored config. */
export interface CdLadderStep {
  id: string;
  label: string;
  /** Rolling twelve-month spend, ex GST, that reaches this rung. */
  threshold: number;
  /** Has this shopper reached it? */
  reached: boolean;
}

/** The figures for ONE variant, all ex GST and already rounded to cents. */
export interface CdVariantPrices {
  /** The catalogue price — `products.price`. Null when the product carries none. */
  rrp: number | null;
  /**
   * The ladder's ENTRY price for this SKU — L1, where member pricing starts.
   * The shallow end of the range the widget draws, in dollars.
   */
  entry: number | null;
  /**
   * The ladder's DEEPEST price for this SKU — the top rung (L7 on Tim's model),
   * the card's "GMC / top-tier discount price". It is a price, read from the
   * same engine at the last configured level, so it is published as a figure and
   * not as a saving. The deep end of the range the widget draws.
   */
  deepest: number | null;
  /**
   * M — the trade price the ladder's ceiling sits at. Rendered ONLY where this
   * channel actually advertises from it (see {@link CdMembershipData.advertisesMates}),
   * because a price nobody on this site can pay does not belong beside one they
   * are about to be charged.
   */
  mates: number | null;
  /**
   * The ladder price at {@link CdMembershipData.levelId} — this shopper's own
   * price for a member, and what joining buys today for everyone else. Null when
   * the ladder did not apply to this SKU (a HELD row, or stale trade data).
   */
  member: number | null;
}

/**
 * Everything the sealed native renders. Serialisable by construction: it
 * crosses the server/client boundary as the route's `nativeData` bag.
 */
export interface CdMembershipData {
  /** This shopper holds an active subscription. */
  isMember: boolean;
  /** Signed in at all — a signed-in non-subscriber is not a member. */
  loggedIn: boolean;
  /**
   * TRUE only when this channel's ladder advertises the Mates Rates price to a
   * logged-out visitor (`MemberLadderConfig.advertisedPrice === "mates"`), i.e.
   * when M is genuinely what a stranger is charged.
   *
   * It defaults to false, and while it is false the Mates Rates row is NOT
   * rendered. That is the whole guard against the failure this panel was
   * rejected for once: on Chefs Depot today a guest pays `products.price` (the
   * channel suppresses the shared sale price), so printing "Mates Rates — what
   * you pay today" beside a headline charging ~22% more is wrong money on a
   * customer face. The row appears with the switch that makes it true, which is
   * Tim's call plus the RRP label change on the headline — one piece of work,
   * card gk23c1VK's own module says so in terms.
   */
  advertisesMates: boolean;
  /** The rung this shopper's prices are resolved at. */
  levelId: string;
  levelLabel: string;
  /** 0-based position on the ladder, for drawing the rail. */
  levelIndex: number;
  ladder: CdLadderStep[];
  /**
   * Rolling twelve-month ex-GST goods spend. Null for anyone who is not a
   * member — a stranger has no spend to report and we do not invent one.
   */
  trailingSpend: number | null;
  /** Dollars of further rolling spend to the next rung; null at the top. */
  spendToNext: number | null;
  nextLevelLabel: string | null;
  /**
   * GST-inclusive monthly membership fee, for the join pitch.
   *
   * The pitch lives HERE and not only in `PriceBlock.tsx` because on Chefs Depot
   * `PriceBlock` does not draw the product page's gold box at all: channel 2's
   * stored `price-panel` component does, and its teaser is conditioned on
   * `purchase.showMemberTeaser` = `memberSavingsPct > 0`. Retiring the
   * percentage therefore makes that box VANISH, and this panel is the only
   * membership call to action left on the screen.
   */
  membershipMonthly: number;
  /** Where "Join" goes. Resolved by the route, never guessed in the component. */
  joinHref: string;
  /** Priced variants, keyed by variant id. A variant with no trade row is absent. */
  pricesByVariant: Record<number, CdVariantPrices>;
  /** The variant the page opens on, so the panel and the headline agree. */
  defaultVariantId: number | null;
  /** Label of the first rung — the shallow end of the range. */
  entryLevelLabel: string;
  /** Label of the last rung — the deep end, and the top-tier price's own label. */
  deepestLevelLabel: string;
  /** True when this shopper is already ON the deepest rung. */
  atDeepestLevel: boolean;
}

/**
 * The figures for the variant on screen, falling back to the one the page
 * opened on. Null when this SKU carries no trade row at all — the panel then
 * renders nothing rather than a partial claim.
 */
export function pricesForVariant(
  data: CdMembershipData,
  activeVariantId: number | null
): CdVariantPrices | null {
  const id = activeVariantId ?? data.defaultVariantId;
  if (id == null) return null;
  return data.pricesByVariant[id] ?? null;
}

/** `$1,100` — thresholds and gaps are whole dollars; cents on a ladder rung read as noise. */
export function formatWholeDollars(value: number): string {
  return `$${Math.round(value).toLocaleString("en-AU")}`;
}

/**
 * Does this figure equal the one the page is actually charging?
 *
 * The "what you pay today" note is attached by COMPARISON, never by assumption:
 * whichever rendered row matches the price the buy box is charging carries it,
 * and if none of them match, no row makes a payment claim at all. That is
 * structural — it is not possible for this panel to print a payment claim the
 * page contradicts, whatever a channel setting happens to say.
 */
export function isChargedAmount(value: number | null, chargedExGst: number | null): boolean {
  if (value == null || chargedExGst == null) return false;
  return Math.abs(value - chargedExGst) < 0.005;
}
