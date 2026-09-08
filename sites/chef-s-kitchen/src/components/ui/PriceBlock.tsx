"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import { useGst, adjustForGst } from "@/lib/gst";
import { GstToggle } from "@/components/layout/GstToggle";
import { derivePriceDisplay } from "./price-display";

/**
 * Design-system pricing block — the single component that renders the trade
 * pricing model so cards, PDP and cart never diverge.
 *
 * Who sees what:
 *   Public   $1,683.00 ex GST · RRP
 *            (pdp) gold box, Tim's price note: "You're seeing our standard
 *            price. Members buy this line lower — and almost 40,000 others —
 *            lower again as their twelve-month spend grows." [See member pricing]
 *   Member   $1,346.40 ex GST [★ MEMBER PRICE] / RRP ~~$1,683~~ · You save $337 (20%)
 *   Account  $1,500.00 ex GST · Your account price / RRP ~~$1,683~~
 *
 * A member price is only ever computed for an actual member (see lib/member.ts),
 * so nothing here can show trade pricing to the public even if called wrongly.
 * The decision lives in price-display.ts; this file only formats it.
 *
 * All figures are stored ex-GST and derived for display (inc = ex × 1.1).
 */
export function PriceBlock({
  rrp,
  memberPrice,
  isMember,
  accountPricing = false,
  memberSavingsPct = 0,
  size = "card",
  className = "",
}: {
  rrp: number;
  memberPrice?: number | null;
  isMember?: boolean;
  /**
   * The cheapest plan's monthly price. NO LONGER RENDERED: Tim's price note
   * (card Nyp8bkPm, his widget kit) does not quote the fee — it lives on
   * `/membership` and in the cart upsell, which is his own split. The prop stays
   * because every listing tile and the PDP already thread it, and dropping it
   * would be a rename across eight call sites for nothing.
   */
  planPrice?: string | null;
  /** The memberPrice is a negotiated B2B contract price, not a member price. */
  accountPricing?: boolean;
  /** What membership saves on this product, as a whole percentage — non-members
   *  only. Never paired with a price. */
  memberSavingsPct?: number;
  size?: "card" | "pdp";
  className?: string;
}) {
  const { inclusive, pricesIncludeTax } = useGst();
  const adj = (n: number) => adjustForGst(n, inclusive, pricesIncludeTax);
  const fmt = (n: number) =>
    `$${adj(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtRound = (n: number) => `$${Math.round(adj(n)).toLocaleString("en-AU")}`;
  const gstLabel = inclusive ? "inc GST" : "ex GST";

  const d = derivePriceDisplay({ rrp, memberPrice, isMember, accountPricing, memberSavingsPct });
  if (d.hidden) return null;

  const big = size === "pdp" ? "text-[33px]" : "text-lg";

  return (
    <div className={className}>
      {/* Headline: the price this shopper actually gets */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={`${big} font-bold leading-none tracking-[-0.02em] text-text-primary`}>
          {fmt(d.headline)}
        </span>
        <span className="text-xs font-semibold text-steel-500">{gstLabel}</span>
        {d.showRrpLabel && (
          <span className="text-xs font-semibold uppercase tracking-wide text-steel-400">RRP</span>
        )}
        {d.showMemberBadge && size === "pdp" && (
          <span className="badge-member ml-1">
            <Star className="h-3 w-3 fill-current" />
            Member Price
          </span>
        )}
        {d.showAccountLabel && size === "pdp" && (
          <span className="text-xs font-semibold text-member-text">Your account price</span>
        )}
      </div>

      {/* Struck RRP — only when something beats it */}
      {d.showStruckRrp && (
        <p className={`mt-1 text-steel-500 ${size === "card" ? "text-xs" : "text-[13px]"}`}>
          RRP <s className="text-steel-400">{fmt(rrp)}</s>
          {size === "pdp" && d.savings > 0 && (
            <>
              {" · "}
              <b className="text-member-text">
                You save {fmtRound(d.savings)} ({d.savingsPct}%)
              </b>
            </>
          )}
          {size === "card" && d.showAccountLabel && (
            <>
              {" · "}
              <b className="text-member-text">Your account price</b>
            </>
          )}
        </p>
      )}

      {/* The ex/inc-GST switch, PDP only — directly under the price and its RRP
          line, above the join funnel. It used to live in the masthead; it now
          sits with the price it controls, in normal flow so it renders at every
          breakpoint. Listing cards (size="card") deliberately get nothing — the
          setting is site-wide and only changeable from a product page. */}
      {size === "pdp" && <GstToggle variant="light" className="mt-3" />}

      {/* Member saving on cards */}
      {d.savings > 0 && size === "card" && (
        <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-member-text">
          <Star className="h-3 w-3 fill-current" />
          Member saves {fmtRound(d.savings)} ({d.savingsPct}%)
        </p>
      )}

      {/* Join funnel — Tim's "Product page price note", verbatim (card gk23c1VK
          attachment `05-widget-kit.html`; his model approved 2026-08-24).
          Deliberately NOT nested inside "there is a member price": the people
          this is aimed at are exactly the ones who have none.

          IT NO LONGER CLAIMS THE MEMBER PRICE IS HIDDEN. It used to read
          "Members save up to X% — join from $14.95/mo to see member pricing",
          and when card Nyp8bkPm retired that percentage at source the branch
          underneath it read "Members get wholesale pricing — join to see member
          pricing." Both are now wrong wherever the ladder is on: the panel
          PUBLISHES the member price, and a member's entry price is `W x 1.01`,
          one percent ABOVE wholesale rather than at it. Tim's sentence is true
          in both respects, and his open item 8 is about retiring exactly this
          class of unsubstantiated claim.

          WHERE THIS BOX ACTUALLY RENDERS, AND WHERE IT DOES NOT. Not on the
          Chefs Depot product page: that page draws its gold box from channel 2's
          stored `price-panel` Site Builder component, whose teaser node is
          conditioned on `memberSavingsPct > 0` and therefore disappears with the
          percentage. `2/price-panel` is the only stored component in either
          channel that uses that teaser or a price native, so this box and
          `CdMemberPricingPanel`'s Join button cannot both appear on one screen
          today. This one covers the surfaces PriceBlock does drive — the
          non-builder product detail, the node preview and the template tree. */}
      {d.showJoin && size === "pdp" && (
        <div className="mt-3.5 flex items-center justify-between gap-3 rounded-btn bg-member-bg px-3.5 py-[11px] text-[12.5px] text-member-text">
          <span>
            <b>You&rsquo;re seeing our standard price.</b> Members buy this line lower &mdash; and
            almost 40,000 others &mdash; lower again as their twelve-month spend grows.
          </span>
          <Link href="/membership" className="btn-gold btn-sm shrink-0">
            See member pricing
          </Link>
        </div>
      )}

      {/* Card-sized teaser: one quiet line, no CTA button */}
      {d.showJoin && size === "card" && d.teaserPct > 0 && (
        <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-member-text">
          <Star className="h-3 w-3 fill-current" />
          Members save up to {d.teaserPct}%
        </p>
      )}
    </div>
  );
}
