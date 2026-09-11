"use client";

// ============================================================================
// Chefs Depot member pricing on the product page (cards Nyp8bkPm + gk23c1VK —
// Tim's LOCKED 11 Sep 2026 model, drawn from his `11-pdp-widgets.html`).
//
// SEALED NATIVE, not an authored subtree, for the same reason the SilverChef
// panel is one: the figures follow the LIVE purchase state (which variant is
// selected, whether this product's price is hidden) and an authored tree cannot
// call a pricing engine. Keyed `cd-member-pricing` and placed at render time by
// `builder/cd-member-pricing-node.ts`.
//
// WHAT RENDERS, per Tim's widgets:
//   1 · the public TEASER (a non-member): the deepest member price on THIS
//       product, and that members work DOWN to it as their spend builds — never
//       offered to a stranger, because a new member pays the standard price;
//   2-4 · a MEMBER: their own price, "N% of the way" to the deepest price, the
//       spend still to go, or "at our deepest member price" once there;
//   8 · an EXCLUDED product: a short disclosure instead of any price, to members
//       and non-members alike, confirming their spend still counts.
// It "fails closed": no band on this product (held, excluded, or Wholesale + 1%
// not below the standard price) means no figures at all.
//
// THE JOIN FUNNEL IS NOT GATED ON THE SCALE. With the scale switched OFF — both
// live channels today — a non-member still gets the pitch and the Join button;
// only the prices wait for the switch.
//
// NO PERCENTAGE SAVING, ANYWHERE. "N% of the way" is a position on the scale,
// not a discount. A catalogue-wide saving waits on `CD_PRICING.spread`.
//
// THE MEMBER FLAG IS SERVER-RENDERED. `data-cdp-member` on the panel's root is
// written from `data.isMember`, which the route resolved from the SESSION; a
// member's own figures are only ever in the payload for a member.
//
// A HIDDEN PRICE HIDES ALL OF IT, THE PITCH INCLUDED, and someone on account
// pricing is not pitched at (they have a negotiated contract).
// ============================================================================

import { useProductPurchase } from "@keenan/services/product-page";
import { adjustForGst } from "@keenan/services/calc";
import { useGst } from "@/lib/gst";
import { bestVisiblePrice } from "@/lib/finance/product-finance";
import {
  decidePanel,
  formatWholeDollars,
  positionPercent,
  pricesForVariant,
  type CdMembershipBase,
  type CdMembershipData,
  type CdMembershipLadder,
} from "@/lib/pricing/cd-member-pricing";

/** Ex-GST money in, the figure this shopper's GST switch says, out. */
function useMoney() {
  const { inclusive, pricesIncludeTax } = useGst();
  return (value: number) =>
    `$${adjustForGst(value, inclusive, pricesIncludeTax).toLocaleString("en-AU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
}

/**
 * The pitch without figures.
 *
 * Scale OFF: the first half of Tim's product-page note, which is true of the
 * cost-plus member pricing that runs today.
 *
 * Scale ON, on a product with no figures to publish (no band, held, no trade
 * row, nothing picked yet): "Members buy this line lower" would be FALSE there
 * — a member pays the standard price on a line with no band, and a new member
 * pays it on every line ("anything implying a new member saves on day one" is
 * on Tim's may-not-say list). So it carries only his directional claim, which
 * is true by construction.
 */
function JoinPitch({ scaleOn }: { scaleOn: boolean }) {
  return scaleOn ? (
    <p className="text-sm text-text-secondary">
      <strong className="text-text-primary">Members Spend More, Save More.</strong> Member pricing moves with
      your rolling twelve-month spend, across almost 40,000 items.
    </p>
  ) : (
    <p className="text-sm text-text-secondary">
      <strong className="text-text-primary">You&rsquo;re seeing our standard price.</strong> Members buy
      this line lower &mdash; and almost 40,000 others.
    </p>
  );
}

/** The one membership CTA on a Chefs Depot product page. */
function JoinButton({ data }: { data: CdMembershipBase }) {
  return (
    <a
      href={data.joinHref}
      className="mt-4 inline-flex items-center justify-center rounded-[6px] bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
    >
      {`Join the buying group — $${data.membershipMonthly.toLocaleString("en-AU", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}/month`}
    </a>
  );
}

/** The funnel on its own, with no prices under it. */
function MembershipPitchPanel({ data, scaleOn }: { data: CdMembershipBase; scaleOn: boolean }) {
  return (
    <section
      className="mt-4 rounded-[12px] bg-member-bg p-4"
      aria-label="Chefs Depot membership"
      data-cdp-member={data.isMember ? "true" : undefined}
    >
      <JoinPitch scaleOn={scaleOn} />
      <JoinButton data={data} />
    </section>
  );
}

/** The rail: filled to the member's position; empty (or full, animated) on the teaser. */
function Rail({ fill }: { fill: number }) {
  const pct = Math.min(Math.max(fill, 0), 1) * 100;
  return (
    <div className="relative mt-3 h-1.5 rounded-full bg-border" aria-hidden="true">
      <div className="absolute inset-y-0 left-0 rounded-full bg-member" style={{ width: `${pct}%` }} />
    </div>
  );
}

function Ends({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="mt-1.5 flex justify-between gap-3 text-[11px] text-text-muted">
      <span>{left}</span>
      <span className="text-right">{right}</span>
    </div>
  );
}

function ScalePanel({ data }: { data: CdMembershipLadder }) {
  const purchase = useProductPurchase();
  const money = useMoney();
  const { inclusive, pricesIncludeTax } = useGst();

  const exGst = (value: number | null) =>
    value != null && Number.isFinite(value) && value > 0 ? (pricesIncludeTax ? value / 1.1 : value) : null;

  // What the buy box is charging for ONE unit of the product itself — the SAME
  // function the buy box's own save line and the SilverChef panel read, so the
  // figure compared against is by construction the figure printed above it. The
  // extras are taken back off, and it is normalised ex GST like the scale.
  const memberBase = purchase.activeMemberPrice == null ? null : purchase.activeMemberPrice - purchase.addonTotal;
  const chargedExGst = exGst(
    bestVisiblePrice({
      displayPrice: purchase.displayBasePrice,
      displaySalePrice: purchase.displayBaseSalePrice,
      memberPrice: memberBase,
    })
  );

  const decision = decidePanel({
    data,
    prices: pricesForVariant(data, purchase.activeVariantId),
    chargedExGst,
  });
  const gstLabel = inclusive ? "inc GST" : "ex GST";
  const top = formatWholeDollars(data.topSpend);

  if (decision.kind === "excluded") {
    return (
      <section
        className="mt-4 rounded-[12px] border border-border bg-white p-4"
        aria-label="Member pricing"
        data-cdp-member={data.isMember ? "true" : undefined}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Member pricing</p>
        {/* Tim's widget 8 says "under our agreement with the supplier". A rule
            here may equally be a category (indent, special order) or a line with
            no room in it, so the sentence names only what is true of every rule:
            the price is the same for everyone and the spend still counts. */}
        <p className="mt-1 text-sm text-text-secondary">
          This line is outside member pricing, so everyone pays the same price for it. What you spend on it still
          counts toward your pricing on everything else.
        </p>
      </section>
    );
  }

  if (decision.kind === "none") {
    return data.isMember ? null : <MembershipPitchPanel data={data} scaleOn />;
  }

  if (decision.kind === "teaser") {
    return (
      <section
        className="mt-4 rounded-[12px] bg-member-bg p-4"
        aria-label="Chefs Depot member pricing"
        data-cdp-member={data.isMember ? "true" : undefined}
      >
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-lg font-bold tabular-nums text-text-primary">{money(decision.floor)}</span>
          <span className="text-xs font-semibold text-text-muted">best member price &middot; {gstLabel}</span>
        </div>
        <p className="mt-1 text-sm text-text-secondary">
          Members pay less on this line as their spend builds, down to {money(decision.floor)}.{" "}
          <a href={data.joinHref} className="font-semibold text-text-primary underline underline-offset-2">
            How member pricing works
          </a>
        </p>
        <Rail fill={0} />
        <Ends
          left={
            <>
              <b className="tabular-nums text-text-primary">{money(decision.mates)}</b> at $0 spend
            </>
          }
          right={
            <>
              <b className="tabular-nums text-text-primary">{money(decision.floor)}</b> at {top}
            </>
          }
        />
        <JoinButton data={data} />
      </section>
    );
  }

  // A member.
  return (
    <section
      className="mt-4 rounded-[12px] border border-border bg-white p-4"
      aria-label="Your member price"
      data-cdp-member="true"
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-lg font-bold tabular-nums text-text-primary">{money(decision.price)}</span>
        <span className="text-xs font-semibold text-text-muted">your price &middot; {gstLabel}</span>
        {!decision.atFloor && (
          <span className="ml-auto text-xs font-semibold text-member-text">
            {positionPercent(decision.share)} of the way
          </span>
        )}
      </div>
      {decision.atFloor ? (
        <p className="mt-1 text-sm text-text-secondary">You&rsquo;re at our deepest member price on this line.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-text-secondary">
            {decision.share <= 0 ? "Your price falls as your spend builds. " : ""}
            <strong className="text-text-primary">{formatWholeDollars(decision.toGo)}</strong> more spend takes
            you to {money(decision.floor)} on this line.
          </p>
          <Rail fill={decision.share} />
          <Ends left={<>{formatWholeDollars(decision.spend)} spent</>} right={top} />
        </>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-text-muted">
        Your price moves with your rolling twelve-month spend and is reviewed on the first of each month.
      </p>
    </section>
  );
}

export function CdMemberPricingPanel({ data }: { data: CdMembershipData | null }) {
  const purchase = useProductPurchase();

  if (!data) return null;
  // A product whose price is hidden hides these figures, the widget and the
  // join box with them.
  if (purchase.hidePrice) return null;
  // A product with no price at all sells by quote; there is nothing to price and
  // nothing to pitch against.
  if (!(purchase.displayPrice > 0) && !(purchase.displaySalePrice ?? 0)) return null;
  // Someone on a negotiated contract price is not a join target.
  if (purchase.accountPricing && !data.isMember) return null;

  if (!data.ladderEnabled) return data.isMember ? null : <MembershipPitchPanel data={data} scaleOn={false} />;
  return <ScalePanel data={data} />;
}
