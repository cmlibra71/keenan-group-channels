// ============================================================================
// Chefs Depot member pricing on the product page (cards Nyp8bkPm + gk23c1VK —
// Tim's LOCKED 11 Sep 2026 model).
//
// One SKU, three figures, all ex GST and all read from ONE engine:
//
//   M       the Mates Rate — the standard price. What a logged-out visitor and a
//           member at $0 of spend both pay once the scale is on.
//   floor   Wholesale x 1.01 — the deepest a member can go on THIS product,
//           reached at $50,000 of rolling twelve-month spend.
//   member  this member's own price at their reviewed position between the two.
//
// NOTHING IS CALCULATED HERE, AND NOTHING IS CALCULATED IN THE SERVER HALF
// EITHER. Every figure comes out of `@keenan/services/member-ladder` through
// `getLadderVariantPrices` — the same resolver `PricingEngine` lays over the
// cart, the quote and the order — so one machine can never carry two prices on
// two of our own screens.
//
// PURE SUBPATH ONLY. This module is read by the sealed CLIENT native, so it may
// import `@keenan/services/member-ladder` (arithmetic, no I/O) and nothing else
// from the package. The database reads live in `cd-member-pricing.server.ts`.
//
// NO SAVING PERCENTAGE, ANYWHERE. Tim's pack: "no percentage saving may be
// published until the spread distribution is measured", and the claim blocks
// that would carry one stay hidden while `CD_PRICING.spread` is null. What the
// panel shows instead is what the data DOES support, per Tim's product-page
// widgets (`11-pdp-widgets.html`): this product's own figures in dollars, and
// the member's POSITION on the scale ("42.0% of the way") — a position, not a
// saving.
//
// NOTHING IMPLIES A NEW MEMBER SAVES ON DAY ONE. At $0 of spend a member pays
// the standard price — "there is no price step on joining" — so the public
// teaser names the deepest member price and says members work DOWN to it as
// their spend builds; it never offers it to a stranger (handover §5.3).
//
// THE JOIN PITCH IS NOT PART OF THE SCALE, AND IT DOES NOT WAIT FOR IT. On a
// channel that sells a membership but has the scale off — both live channels
// today — the panel still renders the pitch and the Join button; only the
// PRICES wait for the switch (the register's `sf-product-page` rule: the join
// funnel is never gated on there being a member price).
// ============================================================================

/**
 * Tim's `CD_PRICING.spread` (`03-membership.html`): claim blocks that state a
 * catalogue-wide saving carry `data-requires-spread` and stay hidden while this
 * is null, and his pack says in terms never to fill it with an estimate. No
 * such block is rendered anywhere on either storefront; this constant is the
 * one place a future one must ask, and it is pinned null by a test.
 */
export const CD_PRICING: { spread: number | null } = { spread: null };

/** The figures for ONE variant, ex GST, already rounded to cents. */
export interface CdVariantPrices {
  /** M — the standard price; what a guest and a $0 member pay. */
  mates: number | null;
  /** W x 1.01 — the deepest member price on this SKU. */
  floor: number | null;
  /** This member's scale price; null for anyone who is not a member. */
  member: number | null;
  /**
   * Is there a member band here at all? False on a HELD row (the ingest gate
   * rejected its figures), on an excluded SKU, and where W x 1.01 is not below
   * M (2,915 SKUs on 2026-09-11). No band = nothing to publish — Tim's widget
   * "fails closed" rather than showing a nonsense saving.
   */
  hasBand: boolean;
}

/** The half of the payload that exists whether or not the scale is on. */
export interface CdMembershipBase {
  /**
   * This shopper holds an active subscription. RESOLVED SERVER-SIDE FROM THE
   * SESSION and never from client state: the panel's root renders it as
   * `data-cdp-member`, and a member's own figures are only ever put in the
   * payload for a member — so "member pricing is one console command away from
   * anyone" (handover §4.3) cannot happen.
   */
  isMember: boolean;
  /** Signed in at all — a signed-in non-subscriber is not a member. */
  loggedIn: boolean;
  /** GST-inclusive monthly membership fee, for the join pitch. */
  membershipMonthly: number;
  /** Where "Join" goes. Resolved by the route, never guessed in the component. */
  joinHref: string;
}

/** A channel that sells a membership with the scale switched OFF — both live channels today. */
export interface CdMembershipPitch extends CdMembershipBase {
  ladderEnabled: false;
}

/** Everything the sealed native renders once the channel's scale is ON. */
export interface CdMembershipLadder extends CdMembershipBase {
  ladderEnabled: true;
  /** Rolling twelve-month spend that reaches the floor — $50,000. */
  topSpend: number;
  /** The member's reviewed position, 0..1; null for a non-member. */
  share: number | null;
  /** Rolling twelve-month ex-GST goods spend during paid membership; null for a non-member. */
  trailingSpend: number | null;
  /**
   * This product sits outside member pricing (§2.6). DECLARED on the page to
   * members and non-members alike, and no member price renders.
   */
  productExcluded: boolean;
  /** Priced variants, keyed by variant id. A variant with no trade row is absent. */
  pricesByVariant: Record<number, CdVariantPrices>;
  /** The variant the page opens on (single-variant products only). */
  defaultVariantId: number | null;
}

/** What the route hands the sealed native. Serialisable by construction. */
export type CdMembershipData = CdMembershipPitch | CdMembershipLadder;

/** The figures for the variant on screen, falling back to the one the page opened on. */
export function pricesForVariant(
  data: CdMembershipLadder,
  activeVariantId: number | null
): CdVariantPrices | null {
  const id = activeVariantId ?? data.defaultVariantId;
  if (id == null) return null;
  return data.pricesByVariant[id] ?? null;
}

/** `$21,000` — spends are whole dollars; cents on a spend read as noise. */
export function formatWholeDollars(value: number): string {
  return `$${Math.round(value).toLocaleString("en-AU")}`;
}

/** "42.0%" — FLOORED to one decimal, so a position is never overstated. */
export function positionPercent(share: number): string {
  const s = Number.isFinite(share) ? Math.min(Math.max(share, 0), 1) : 0;
  return `${(Math.floor(s * 1000) / 10).toFixed(1)}%`;
}

/** Do two ex-GST money figures agree to the cent? */
export function isChargedAmount(value: number | null, chargedExGst: number | null): boolean {
  if (value == null || chargedExGst == null) return false;
  return Math.abs(value - chargedExGst) < 0.005;
}

/** What the panel renders for one variant on one page load. */
export type CdPanelDecision =
  /** Nothing true to publish: the pitch for a non-member, nothing for a member. */
  | { kind: "none" }
  /** Outside member pricing: a short disclosure, no price, for everybody. */
  | { kind: "excluded" }
  /** A non-member: the deepest member price on this product and the scale from M down to it. */
  | { kind: "teaser"; mates: number; floor: number }
  /** A member: their own price, their position and the spend still to go. */
  | {
      kind: "member";
      price: number;
      mates: number;
      floor: number;
      share: number;
      /** At the floor already — "no progress bar, they've arrived". */
      atFloor: boolean;
      /** Rolling spend to report beside the rail. */
      spend: number;
      /** Dollars of further rolling spend to the floor (never negative). */
      toGo: number;
    };

/**
 * THE WHOLE SHOW/SUPPRESS DECISION, pure, so it is pinned by unit tests rather
 * than by a screenshot. The component renders what this returns.
 *
 * `chargedExGst` is what the buy box is actually charging for one unit (ex GST).
 * A member's figure is shown only while the page is charging at or under their
 * scale price — "on the nose" normally, under it when a sharper promotion won
 * (never stacked). Charged ABOVE it means the scale is not what is pricing this
 * shopper (a contract price, say), and the panel says nothing rather than print
 * a price they are not being given.
 */
export function decidePanel(input: {
  data: CdMembershipLadder;
  prices: CdVariantPrices | null;
  chargedExGst: number | null;
}): CdPanelDecision {
  const { data, prices, chargedExGst } = input;
  if (data.productExcluded) return { kind: "excluded" };
  if (!prices || !prices.hasBand) return { kind: "none" };
  const { mates, floor } = prices;
  if (mates == null || floor == null || !(floor < mates)) return { kind: "none" };

  if (!data.isMember) return { kind: "teaser", mates, floor };

  if (prices.member == null || chargedExGst == null) return { kind: "none" };
  if (chargedExGst > prices.member + 0.005) return { kind: "none" };
  const share = data.share ?? 0;
  const top = data.topSpend > 0 ? data.topSpend : 50_000;
  // The spend beside the rail is the larger of what the member has really
  // spent and what their priced position stands for: a member whose spend has
  // grown since the last review is not told they have spent less than they have.
  const spend = Math.max(data.trailingSpend ?? 0, share * top);
  return {
    kind: "member",
    price: chargedExGst,
    mates,
    floor,
    share,
    atFloor: share >= 1 - 1e-9,
    spend,
    toGo: Math.max(0, Math.round(top - spend)),
  };
}
