// ============================================================================
// Chefs Depot's prices and the spend-more-save-more ladder, as the product page
// needs them (card Nyp8bkPm; Tim's model, approved on the board 2026-08-24).
//
// One SKU, four figures:
//
//   RRP            what the page's own headline charges for this VARIANT
//   Mates Rates    M — the Industry Kitchens trade price the buying-group model
//                  advertises to a logged-out visitor
//   Member price   this shopper's own price at their rung of the ladder
//   Deepest price  the top rung's price — the card's "GMC / top-tier discount
//                  price", and the deep end of the range the widget draws
//
// RRP IS READ OFF THE PURCHASE PROVIDER, NOT OFF THE PRODUCT ROW, and that is a
// money rule rather than a tidy-up. Everything else here is per VARIANT, and so
// is the headline: `provider.displayBasePrice` is `activeVariant.price ?? product.price`.
// Taking RRP from `products.price` instead put ONE figure beside per-variant ones
// — on the 156 Chefs Depot products whose variants differ in price (e.g. product
// 14893, `products.price` 17,960 against variants 17,960-31,310) the panel would
// print "RRP $17,960" beside a $31,310 headline and a ladder computed for the
// $31,310 variant. So the panel never receives an RRP; it reads the same number
// the headline a centimetre above it is showing, which is why the two cannot
// disagree.
//
// THE RANGE IS PUBLISHED IN DOLLARS, NOT PERCENT. The card asks for "the min and
// max discount available, based on spend". Both ends are PRICES, read from the
// same engine at the first and last configured rungs, so the widget can name
// them for the SKU on screen without deriving a percentage from a spread it has
// not measured. Entry price is where member pricing starts; deepest price is
// where it ends.
//
// ONE CAVEAT ON BASIS, and it is latent rather than live: the RRP comes from the
// provider's display amounts while the ladder figures come from `cd_sku_prices`,
// and both are ex GST on every channel today. If a channel ever set
// `pricesIncludeTax`, `adjustForGst` would treat the two identically and they
// would no longer be on the same basis. No channel sets it; the panel would need
// splitting first.
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
//
// THE JOIN PITCH IS NOT PART OF THE LADDER, AND IT DOES NOT WAIT FOR IT.
// See {@link CdMembershipPitch}: on the state this actually merges in — every
// channel with `cd_member_ladder` unwritten — the panel still renders Tim's
// pitch and the Join button, and only the PRICES wait for the switch. That is
// the register's `sf-product-page` rule ("the join funnel is not gated on there
// being a member price"), and on Chefs Depot it is now the only thing keeping a
// membership call to action on the page at all.
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

/** The ladder figures for ONE variant, all ex GST and already rounded to cents. */
export interface CdVariantPrices {
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
   * channel actually advertises from it (see {@link CdMembershipLadder.advertisesMates}),
   * because a price nobody on this site can buy at does not belong beside one
   * they are about to be charged.
   */
  mates: number | null;
  /**
   * The ladder price at {@link CdMembershipLadder.levelId} — this shopper's own
   * price for a member, and what joining buys today for everyone else. Null when
   * the ladder did not apply to this SKU (a HELD row, or stale trade data).
   */
  member: number | null;
}

/** The half of the payload that exists whether or not this channel runs a ladder. */
export interface CdMembershipBase {
  /** This shopper holds an active subscription. */
  isMember: boolean;
  /** Signed in at all — a signed-in non-subscriber is not a member. */
  loggedIn: boolean;
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
}

/**
 * THE STATE THIS CHANGE ACTUALLY MERGES IN: a channel that sells a membership
 * but has no ladder switched on (`channel_settings.cd_member_ladder` is absent
 * on both live channels).
 *
 * There are no prices to publish, so none are — but the JOIN FUNNEL still has to
 * be on the page. Retiring the savings percentage takes channel 2's stored
 * teaser box off the screen (`memberSavingsPct > 0` is its only condition) and
 * the stored join strip never fires for a Chefs Depot guest (`hasSave &&
 * !isMember`, and a guest has no member price), so without this the product page
 * would carry ZERO membership calls to action the moment this merged. The
 * register's rule on `sf-product-page` says in terms that the funnel is never
 * gated on there being a member price; this is that rule, kept.
 *
 * Null instead of this on any channel with no membership plan, which is how
 * Industry Kitchens is excluded — by its own data, not by a site name.
 */
export interface CdMembershipPitch extends CdMembershipBase {
  ladderEnabled: false;
}

/** Everything the sealed native renders once the channel's ladder is on. */
export interface CdMembershipLadder extends CdMembershipBase {
  ladderEnabled: true;
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
 * What the route hands the sealed native. Serialisable by construction: it
 * crosses the server/client boundary as the route's `nativeData` bag.
 */
export type CdMembershipData = CdMembershipPitch | CdMembershipLadder;

/**
 * The figures for the variant on screen, falling back to the one the page
 * opened on. Null when this SKU carries no trade row at all — the panel then
 * publishes no prices rather than a partial claim (it still shows the pitch).
 */
export function pricesForVariant(
  data: CdMembershipLadder,
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

/** What the row block should render for one variant on one page load. */
export interface CdPriceRowDecision {
  showRrp: boolean;
  showMates: boolean;
  showMember: boolean;
  showDeepest: boolean;
  /** The figure the member row prints — the CHARGED price for a member. */
  memberAmount: number | null;
  rrpIsCharged: boolean;
  matesIsCharged: boolean;
  deepestIsCharged: boolean;
  /** False when there is nothing true to publish; the panel falls back to the pitch. */
  anyRow: boolean;
}

/**
 * WHICH ROWS ARE TRUE — the whole show/suppress decision, pure, so it can be
 * pinned by unit tests rather than only by a screenshot. The component does no
 * deciding of its own; it renders what this returns.
 *
 * `rrpExGst` is the page's OWN headline base amount for the active variant (see
 * the file header) and `chargedExGst` is what the buy box is charging, both
 * normalised ex GST by the caller.
 */
export function decidePriceRows(input: {
  data: CdMembershipLadder;
  prices: CdVariantPrices | null;
  rrpExGst: number | null;
  chargedExGst: number | null;
}): CdPriceRowDecision {
  const { data, prices, rrpExGst, chargedExGst } = input;
  const none: CdPriceRowDecision = {
    showRrp: false,
    showMates: false,
    showMember: false,
    showDeepest: false,
    memberAmount: null,
    rrpIsCharged: false,
    matesIsCharged: false,
    deepestIsCharged: false,
    anyRow: false,
  };
  if (!prices) return none;

  //  - `catalogue` (today, and the only live setting): the shopper pays the
  //    channel's own catalogue price, so RRP is real and M is a trade price
  //    nobody on this site can buy at. RRP + member price + deepest.
  //  - `mates`: the ladder has replaced the advertised price with M, so the
  //    headline IS the Mates Rates figure and the page no longer carries an RRP
  //    for this panel to quote. Restoring the third row means the page's own
  //    headline chip stops saying "RRP" — `components/ui/PriceBlock.tsx`, card
  //    gk23c1VK's work and part of the same switch. Printing a second, different
  //    "RRP" beside a headline chip that still says RRP would make the screen
  //    contradict itself, which is the failure this panel already had once.
  const showMates = data.advertisesMates && prices.mates != null;
  const showRrp = !data.advertisesMates && rrpExGst != null && rrpExGst > 0;

  // THE MEMBER ROW.
  //
  // For a MEMBER it is not a second opinion about their price — it IS the price
  // the buy box is charging, labelled with the rung that produced it. It renders
  // only while the page is charging at or under the ladder figure, which is what
  // "the ladder is pricing this shopper" means: on the nose normally, under it
  // when a clearance or a contract price beat the ladder (the engine takes the
  // better of the two and never stacks them). Charged ABOVE the ladder figure
  // means the ladder is NOT in force for this shopper, and the panel says
  // nothing rather than print a member price they are not being given. One
  // machine, one member price, on every one of our screens.
  //
  // For everyone else it is the ENTRY rung — what joining would buy today —
  // labelled as such and never as an offer. A guest is still charged the
  // standard price (`sf-product-page`: a guest is never PRICED at a member tier).
  const memberCharged =
    data.isMember && prices.member != null && chargedExGst != null
      ? chargedExGst <= prices.member + 0.005
      : false;
  const memberAmount = data.isMember ? (memberCharged ? chargedExGst : null) : prices.member;
  const showMember = memberAmount != null;

  // THE TOP-TIER ROW — the card's third figure, and the deep end of the range.
  //
  // It is the ladder's price for THIS SKU at the last configured rung, read from
  // the engine at that level. It is suppressed only when it would repeat a row
  // already on screen: a member already at the deepest rung is looking at their
  // own price, and printing it twice under two labels reads as two prices for
  // one machine — the failure this panel is fenced against.
  const deepestIsDuplicate =
    data.atDeepestLevel ||
    (memberAmount != null &&
      prices.deepest != null &&
      Math.abs(prices.deepest - memberAmount) < 0.005);
  const showDeepest = prices.deepest != null && !deepestIsDuplicate;

  return {
    showRrp,
    showMates,
    showMember,
    showDeepest,
    memberAmount,
    rrpIsCharged: showRrp && isChargedAmount(rrpExGst, chargedExGst),
    matesIsCharged: showMates && isChargedAmount(prices.mates, chargedExGst),
    deepestIsCharged: showDeepest && isChargedAmount(prices.deepest, chargedExGst),
    anyRow: showRrp || showMates || showMember || showDeepest,
  };
}
