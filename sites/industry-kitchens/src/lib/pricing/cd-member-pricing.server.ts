import "server-only";

// ============================================================================
// Building the Chefs Depot member-pricing panel's data, server side (cards
// Nyp8bkPm + gk23c1VK — Tim's locked 11 Sep 2026 model).
//
// Split from `cd-member-pricing.ts` because THIS half touches the database and
// therefore imports the store, which drags sharp with it. The sealed native is a
// client component; a client component that reached this file would 500 the
// product page. Same rule the SilverChef panel already documents.
//
// IT COMPUTES NO MONEY. Every figure is read from the one engine through
// channel-bound accessors:
//
//   getMemberLadderShare()     the member's reviewed position, off the stored
//                              `cd_member_tiers` row — the SAME value threaded
//                              into every pricing call this request. Deriving a
//                              position from live spend here instead would put
//                              the panel on a different price from the cart the
//                              moment a member placed an order mid-month.
//   getLadderVariantPrices()   the scale's resolver, staleness gate and
//                              exclusions included.
//
// TWO GATES, NOT ONE, AND THEY GATE DIFFERENT THINGS.
//
//   THE PLAN gates the join pitch. A channel that publishes a subscription plan
//   sells a membership, so a non-member on it gets the pitch and the Join
//   button. Channel 2 has one ($14.95); channel 1 has none, which is how
//   Industry Kitchens is excluded — by its own data rather than by a site name.
//
//   THE SCALE gates the PRICES. Everything drawn from `cd_sku_prices` waits on
//   `channel_settings.cd_member_ladder` being enabled — the same switch that
//   governs the engine doing the pricing, so the panel cannot publish a price
//   before the price is real. It is unwritten on both live channels.
// ============================================================================

import { cache } from "react";
import { getSession } from "@/lib/auth";
import {
  getLadderConfig,
  getLadderVariantPrices,
  getMemberLadderShare,
  getMemberPricingExclusion,
  getMemberTrailingSpend,
} from "@/lib/store";
import { floorPrice } from "@keenan/services/member-ladder";
import type { CdMembershipData, CdMembershipPitch, CdVariantPrices } from "./cd-member-pricing";

/**
 * Where a shopper joins. Tim's pack flags `/account/register` as its own guess;
 * `/membership` is the page that exists on this storefront today and is the page
 * his replacement copy is written for, so the CTA opens that.
 */
const JOIN_HREF = "/membership";

/**
 * One config read per request rather than one per call. The config accessor is
 * already memoised for a minute inside the service; this stops a page that asks
 * twice paying for it twice.
 */
const ladderConfig = cache(() => getLadderConfig());

/**
 * The member's position on the scale, resolved ONCE per request.
 *
 * It is deliberately available on its own, before the payload is built: the
 * pricing call that resolves what the buy box CHARGES takes the same share
 * (`getProductPageData({ memberContext: { ladderShare } })`). Resolve it in one
 * place and hand it to both, or the engine prices a member at one position
 * while the panel beside it reports another.
 *
 * Null for a non-member and on any channel with the scale switched off. 0 for a
 * member never reviewed — the cold start, which pays the standard price.
 */
export const resolveCdLadderShare = cache(
  async (input: { isMember: boolean; accountId: number | null }): Promise<number | null> => {
    if (!input.isMember) return null;
    const config = await ladderConfig().catch(() => null);
    if (!config?.enabled) return null;
    // Keyed the way the tier row is: the ACCOUNT where the shopper has one, else
    // the CONTACT.
    const contactId = (await getSession().catch(() => null))?.contactId ?? null;
    return getMemberLadderShare({ accountId: input.accountId, contactId }).catch(() => null);
  }
);

export interface CdMembershipInput {
  isMember: boolean;
  loggedIn: boolean;
  /** The shopper's buying account, or null. */
  accountId: number | null;
  /**
   * The share the PAYLOAD was priced at — {@link resolveCdLadderShare}'s answer,
   * threaded through `getProductPageData` as well.
   */
  ladderShare: number | null;
  /**
   * GST-inclusive plan price as a string, where the channel publishes one. This
   * is the membership gate: no plan, no panel, which is what keeps Industry
   * Kitchens out (it has no `subscription_plans` row).
   */
  planPrice: string | null;
  product: {
    id: number;
    variants: Array<{ id: number }>;
  };
}

/**
 * The panel's data.
 *
 * Returns the PITCH-ONLY payload whenever this channel sells a membership but
 * has the scale off, so the Join CTA survives. Returns null only where there is
 * no membership to pitch at all, or where the shopper is a member and the scale
 * is off (there is nothing to show them).
 */
export async function buildCdMembershipData(input: CdMembershipInput): Promise<CdMembershipData | null> {
  const planPriceRaw = input.planPrice == null ? NaN : parseFloat(input.planPrice);
  const sellsMembership = Number.isFinite(planPriceRaw) && planPriceRaw > 0;
  if (!sellsMembership) return null;

  const base = {
    isMember: input.isMember,
    loggedIn: input.loggedIn,
    membershipMonthly: planPriceRaw,
    joinHref: JOIN_HREF,
  };
  const pitch: CdMembershipPitch | null = input.isMember ? null : { ...base, ladderEnabled: false };

  const config = await ladderConfig().catch(() => null);
  // THE SCALE SWITCH — unwritten on both live channels, so this is the branch
  // that actually merges.
  if (!config?.enabled) return pitch;

  const variantIds = input.product.variants.map((v) => v.id).filter((id) => Number.isFinite(id));

  // An excluded product is DECLARED whatever else is true of it (§2.6: "silent
  // exclusion is the failure mode to avoid"), so it is resolved first and does
  // not depend on the product carrying trade prices.
  const exclusion = await getMemberPricingExclusion(input.product.id).catch(() => null);
  const productExcluded = exclusion?.excluded === true;

  // A member is priced at their reviewed share (0 when never reviewed); anyone
  // else at null — the standard price, which is what they are charged.
  const memberShare = input.isMember ? (input.ladderShare ?? 0) : null;
  const priced = variantIds.length
    ? await getLadderVariantPrices(variantIds, memberShare).catch(() => null)
    : null;

  const pricesByVariant: Record<number, CdVariantPrices> = {};
  if (priced) {
    for (const variantId of variantIds) {
      const row = priced.rows.get(variantId);
      if (!row) continue;
      const resolved = priced.prices.get(variantId);
      const floor = floorPrice(row, priced.config);
      const roundedFloor = floor == null ? null : Math.round(floor * 100) / 100;
      const excludedHere = productExcluded || priced.excluded.has(variantId);
      const held = row.validationState !== "ok" || priced.stale;
      const hasBand =
        !excludedHere && !held && row.mates != null && roundedFloor != null && roundedFloor < row.mates;
      pricesByVariant[variantId] = {
        mates: row.mates,
        floor: roundedFloor,
        // A member's own figure — and only ever for a member (see
        // `CdMembershipBase.isMember`). Null where the scale did not price the
        // line (held, stale, excluded).
        member:
          input.isMember && resolved && resolved.clamp !== "EXCLUDED" && resolved.clamp !== "OUTSIDE_LADDER"
            ? resolved.price
            : null,
        hasBand,
      };
    }
  }

  // Nothing to publish and nothing to declare: a non-member keeps the pitch.
  if (!productExcluded && Object.keys(pricesByVariant).length === 0) return pitch;

  const memberKey = input.isMember
    ? { accountId: input.accountId, contactId: (await getSession().catch(() => null))?.contactId ?? null }
    : null;
  const spend = memberKey ? await getMemberTrailingSpend(memberKey).catch(() => null) : null;

  return {
    ...base,
    ladderEnabled: true,
    topSpend: config.fullShareSpend,
    share: memberShare,
    trailingSpend: spend ? spend.spend : null,
    productExcluded,
    pricesByVariant,
    // ONLY a single-variant product has a variant the page can be said to have
    // "opened on". The purchase provider starts with no variant selected, so a
    // multi-variant product's headline is the PRODUCT's price until the shopper
    // picks — and picking "the lowest variant id" would let the panel quote a
    // different machine from the headline.
    defaultVariantId: variantIds.length === 1 ? variantIds[0] : null,
  };
}
