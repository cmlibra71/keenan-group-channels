import "server-only";

// ============================================================================
// Building the Chefs Depot membership panel's data, server side (card Nyp8bkPm).
//
// Split from `cd-member-pricing.ts` because THIS half touches the database and
// therefore imports the store, which drags sharp with it. The sealed native is a
// client component; a client component that reached this file would 500 the
// product page. Same rule the SilverChef panel already documents.
//
// IT COMPUTES NO MONEY. Every figure is read from card gk23c1VK's ladder — the
// one engine — through two channel-bound accessors:
//
//   getMemberLadderLevelId()   the shopper's rung, off the stored `cd_member_tiers`
//                              row, which is the SAME value threaded into every
//                              pricing call this request. Deriving a rung from
//                              live spend here instead would put the panel on a
//                              different rung from the cart the moment a member
//                              placed an order mid-month.
//   getLadderVariantPrices()   `priceVariantsAtLevel`, the same call the pricing
//                              engine's overlay makes, staleness gate included.
//
// TWO GATES, NOT ONE, AND THEY GATE DIFFERENT THINGS.
//
//   THE PLAN gates the join pitch. A channel that publishes a subscription plan
//   sells a membership, so a non-member on it gets the pitch and the Join
//   button. Channel 2 has one ($14.95); channel 1 has none, which is how
//   Industry Kitchens is excluded — by its own data rather than by a site name.
//
//   THE LADDER gates the PRICES. Everything drawn from `cd_sku_prices` waits on
//   `channel_settings.cd_member_ladder` being enabled — the same switch that
//   governs the engine actually doing the pricing, so the panel cannot publish a
//   price before the price is real. It is absent on both live channels, so this
//   merges with the prices dark.
//
// SPLITTING THEM IS THE POINT, and it is the review finding that sent the first
// cut back. Gating the whole panel on the ladder meant that on merge a Chefs
// Depot product page carried NO membership call to action at all: retiring the
// savings percentage takes channel 2's stored teaser box off the screen
// (`purchase.showMemberTeaser` = `memberSavingsPct > 0`) and the stored join
// strip never fires for a guest (`hasSave && !isMember`). The register's
// `sf-product-page` rule — the join funnel is never gated on there being a
// member price — is what this split keeps true.
// ============================================================================

import { cache } from "react";
import { getSession } from "@/lib/auth";
import {
  getLadderConfig,
  getLadderVariantPrices,
  getMemberLadderLevelId,
  getMemberTrailingSpend,
} from "@/lib/store";
import type {
  CdLadderStep,
  CdMembershipData,
  CdMembershipPitch,
  CdVariantPrices,
} from "./cd-member-pricing";

/** What one `getLadderVariantPrices` call comes back with — null off a ladder. */
type LadderPricesAtLevel = Awaited<ReturnType<typeof getLadderVariantPrices>>;

/**
 * Where a shopper joins. Tim's pack flags `/account/register` as its own guess;
 * `/membership` is the page that exists on this storefront today and is the page
 * his replacement copy is written for, so the CTA opens that.
 */
const JOIN_HREF = "/membership";

/**
 * One ladder-config read per request rather than one per call. The config
 * accessor is already memoised for a minute inside the service; this stops a
 * page that asks twice paying for it twice.
 */
const ladderConfig = cache(() => getLadderConfig());

/**
 * The shopper's rung, resolved ONCE per request.
 *
 * "Once" is a guarantee of the CALL SITE, not of `cache()`: the argument is a
 * fresh object literal every time, so React's memo key never matches and this
 * would re-run if it were called twice. It is called once, by the route, which
 * then hands the answer to both consumers below. `cache()` is kept only so a
 * future second caller is cheap to make correct, not because it is load-bearing.
 *
 * It is deliberately available on its own, before the payload is built: the
 * pricing call that resolves what the buy box CHARGES takes the same rung
 * (`getProductPageData({ memberContext: { ladderLevelId } })`). Resolve it in
 * one place and hand it to both, or the engine prices a Level 4 member at Level
 * 1 while the panel beside it says Level 4 — which is the two-prices-on-one-
 * screen failure this panel exists to avoid.
 *
 * Null for a non-member and on any channel with no ladder switched on.
 */
export const resolveCdLadderLevelId = cache(
  async (input: { isMember: boolean; accountId: number | null }): Promise<string | null> => {
    if (!input.isMember) return null;
    const config = await ladderConfig().catch(() => null);
    if (!config?.enabled) return null;
    // Keyed the way the tier row is: the ACCOUNT where the shopper has one, else
    // the CONTACT. Keying on the account alone would put most Chefs Depot members
    // on the entry rung with nothing recorded against them — only 13 of 84 orders
    // on that channel carry an account id.
    const contactId = (await getSession().catch(() => null))?.contactId ?? null;
    return getMemberLadderLevelId({ accountId: input.accountId, contactId }).catch(() => null);
  }
);

export interface CdMembershipInput {
  isMember: boolean;
  loggedIn: boolean;
  /** The shopper's buying account, or null. */
  accountId: number | null;
  /**
   * The rung the PAYLOAD was priced at — {@link resolveCdLadderLevelId}'s answer,
   * threaded through `getProductPageData` as well, so the panel and the buy box
   * cannot land on different rungs of the same ladder in one page load.
   */
  ladderLevelId: string | null;
  /**
   * GST-inclusive plan price as a string, where the channel publishes one. This
   * is the membership gate: no plan, no panel, which is what keeps Industry
   * Kitchens out (its route passes null; it has no `subscription_plans` row).
   */
  planPrice: string | null;
  product: {
    variants: Array<{ id: number }>;
  };
}

/**
 * The panel's data.
 *
 * Returns the PITCH-ONLY payload whenever this channel sells a membership but
 * has no ladder prices to publish for this shopper — no ladder switched on, no
 * priceable variant, no trade row — because the Join CTA has to survive all
 * three (see the header note). Returns null only where there is no membership to
 * pitch at all, or where the shopper is already a member and there are no
 * figures to show them.
 */
export async function buildCdMembershipData(
  input: CdMembershipInput
): Promise<CdMembershipData | null> {
  const planPriceRaw = input.planPrice == null ? NaN : parseFloat(input.planPrice);
  const sellsMembership = Number.isFinite(planPriceRaw) && planPriceRaw > 0;
  // No plan on this channel = no membership model = nothing to say. Industry
  // Kitchens stops here, and so would Chefs Depot if the plan were retired.
  if (!sellsMembership) return null;

  const base = {
    isMember: input.isMember,
    loggedIn: input.loggedIn,
    membershipMonthly: planPriceRaw,
    joinHref: JOIN_HREF,
  };
  // A member has nothing to join, so a pitch with no prices on it is an empty
  // box. Everyone else keeps the funnel.
  const pitch: CdMembershipPitch | null = input.isMember
    ? null
    : { ...base, ladderEnabled: false };

  const config = await ladderConfig().catch(() => null);
  // THE LADDER SWITCH — see the header note. Absent on both live channels, so
  // this is the branch that actually merges.
  if (!config?.enabled || config.levels.length === 0) return pitch;

  const variantIds = input.product.variants.map((v) => v.id).filter((id) => Number.isFinite(id));
  if (variantIds.length === 0) return pitch;

  // The shopper's own rung — the one the payload was priced at. Anyone who is
  // not a member is shown the ENTRY rung, which is what joining buys today: the
  // pitch, labelled as such and never presented as a price they are charged.
  const levelId = (input.isMember ? input.ladderLevelId : null) ?? config.levels[0].id;

  const memberKey = input.isMember
    ? {
        accountId: input.accountId,
        contactId: (await getSession().catch(() => null))?.contactId ?? null,
      }
    : null;

  // THE TWO ENDS OF THE RANGE, as prices.
  //
  // The card asks for the top-tier ("GMC") price and for a widget naming the min
  // and max available. Both are PRICES at a configured rung, so both come out of
  // the same `priceVariantsAtLevel` call at a different level — never derived,
  // never a percentage. Deduped by level id (a non-member sits ON the entry rung,
  // a top-rung member ON the deepest) so the common case is two reads, not three,
  // and issued together rather than in series.
  const entryLevelId = config.levels[0].id;
  const deepestLevelId = config.levels[config.levels.length - 1].id;
  const wantedLevels = Array.from(new Set([levelId, entryLevelId, deepestLevelId]));
  const priced = await Promise.all(
    wantedLevels.map((id) =>
      getLadderVariantPrices(variantIds, id)
        .catch(() => null)
        .then((result) => [id, result] as const)
    )
  );
  const byLevel = new Map(priced);

  const ladderPrices = byLevel.get(levelId) ?? null;
  if (!ladderPrices) return pitch;
  const entryPrices = byLevel.get(entryLevelId) ?? null;
  const deepestPrices = byLevel.get(deepestLevelId) ?? null;

  const pricesByVariant: Record<number, CdVariantPrices> = {};
  for (const variantId of variantIds) {
    const row = ladderPrices.rows.get(variantId);
    if (!row) continue;
    const resolved = ladderPrices.prices.get(variantId);
    // Same rule for every ladder figure: `levelId` comes back null when the
    // ladder did NOT apply — a HELD row, or trade data past its freshness
    // window. Both cases price at M for everybody, so there is no ladder figure
    // to show at that rung and none is invented.
    const atLevel = (result: LadderPricesAtLevel) => {
      const r = result?.prices.get(variantId);
      return r?.levelId ? r.price : null;
    };
    pricesByVariant[variantId] = {
      mates: row.mates,
      entry: atLevel(entryPrices),
      deepest: atLevel(deepestPrices),
      member: resolved?.levelId ? resolved.price : null,
    };
  }
  if (Object.keys(pricesByVariant).length === 0) return pitch;

  const levelIndex = Math.max(
    0,
    config.levels.findIndex((l) => l.id === levelId)
  );
  const level = config.levels[levelIndex];
  const next = config.levels[levelIndex + 1] ?? null;

  const ladder: CdLadderStep[] = config.levels.map((rung, index) => ({
    id: rung.id,
    label: rung.label,
    threshold: rung.threshold,
    reached: index <= levelIndex,
  }));

  // The spend the widget reports, on the same key the rung was resolved from.
  const spend = memberKey ? await getMemberTrailingSpend(memberKey).catch(() => null) : null;

  return {
    ...base,
    ladderEnabled: true,
    advertisesMates: config.advertisedPrice === "mates",
    levelId: level.id,
    levelLabel: level.label,
    levelIndex,
    ladder,
    trailingSpend: spend ? spend.spend : null,
    // The gap to the next rung is a configured threshold minus a measured spend.
    // Never below zero: a member sitting above their rung's threshold but not yet
    // reviewed onto the next one has a real gap, not a negative one.
    spendToNext:
      spend && next ? Math.max(0, Math.round((next.threshold - spend.spend) * 100) / 100) : null,
    nextLevelLabel: next?.label ?? null,
    pricesByVariant,
    entryLevelLabel: config.levels[0].label,
    deepestLevelLabel: config.levels[config.levels.length - 1].label,
    atDeepestLevel: levelIndex === config.levels.length - 1,
    // ONLY a single-variant product has a variant the page can be said to have
    // "opened on". The purchase provider starts with no variant selected, so a
    // multi-variant product's headline is the PRODUCT's price until the shopper
    // picks — and picking "the lowest variant id" would let the panel quote a
    // different machine from the headline on a 162-variant SKU. Null here means
    // the panel publishes no prices until a selection is made (it still pitches).
    defaultVariantId: variantIds.length === 1 ? variantIds[0] : null,
  };
}
