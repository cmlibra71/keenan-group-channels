"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import { useGst, adjustForGst } from "@/lib/gst";

/**
 * Design-system pricing block — the single component that renders the trade
 * pricing model so cards, PDP and cart never diverge. Per the reference
 * (.pricecard / prodcard demos) the MEMBER PRICE is always the headline when
 * it undercuts RRP; RRP is struck with the savings beside it; the gold
 * "Not a member? Join … to unlock this price" box shows for guests only.
 *
 *  Card:  $1,346.40 ex GST  /  RRP ~~$1,683~~  /  ★ Member saves $336.60 (20%)
 *  PDP:   $1,346.40 ex GST [★ MEMBER PRICE]  /  RRP ~~$1,683~~ · You save $336.60 (20%)
 *         (guest) gold box: Not a member? Join from $14.95/mo to unlock this price [Join]
 *
 * All figures are stored ex-GST and derived for display (inc = ex × 1.1).
 */
export function PriceBlock({
  rrp,
  memberPrice,
  isMember,
  planPrice,
  size = "card",
  className = "",
}: {
  rrp: number;
  memberPrice?: number | null;
  isMember?: boolean;
  planPrice?: string | null;
  size?: "card" | "pdp";
  className?: string;
}) {
  const { inclusive, pricesIncludeTax } = useGst();
  const adj = (n: number) => adjustForGst(n, inclusive, pricesIncludeTax);
  const fmt = (n: number) =>
    `$${adj(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtRound = (n: number) => `$${Math.round(adj(n)).toLocaleString("en-AU")}`;
  const gstLabel = inclusive ? "inc GST" : "ex GST";

  if (!Number.isFinite(rrp) || rrp <= 0) return null;

  const hasMemberDeal = memberPrice != null && memberPrice > 0 && memberPrice < rrp;
  const headline = hasMemberDeal ? memberPrice! : rrp;
  const savings = hasMemberDeal ? rrp - memberPrice! : 0;
  const savingsPct = hasMemberDeal ? Math.round((savings / rrp) * 100) : 0;
  const big = size === "pdp" ? "text-[33px]" : "text-lg";
  const join = planPrice ? parseFloat(planPrice).toFixed(2) : "14.95";

  return (
    <div className={className}>
      {/* Headline = member price when a deal exists, else RRP */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={`${big} font-bold leading-none tracking-[-0.02em] text-text-primary`}>
          {fmt(headline)}
        </span>
        <span className="text-xs font-semibold text-steel-500">{gstLabel}</span>
        {hasMemberDeal && size === "pdp" && (
          <span className="badge-member ml-1">
            <Star className="h-3 w-3 fill-current" />
            Member Price
          </span>
        )}
      </div>

      {hasMemberDeal && (
        <>
          {/* RRP struck + savings */}
          <p className={`mt-1 text-steel-500 ${size === "card" ? "text-xs" : "text-[13px]"}`}>
            RRP <s className="text-steel-400">{fmt(rrp)}</s>
            {size === "pdp" && (
              <>
                {" · "}
                <b className="text-member-text">You save {fmtRound(savings)} ({savingsPct}%)</b>
              </>
            )}
          </p>
          {size === "card" && (
            <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-member-text">
              <Star className="h-3 w-3 fill-current" />
              Member saves {fmtRound(savings)} ({savingsPct}%)
            </p>
          )}

          {/* Guest-only join funnel (gold box on PDP) */}
          {!isMember && size === "pdp" && (
            <div className="mt-3.5 flex items-center justify-between gap-3 rounded-btn bg-member-bg px-3.5 py-[11px] text-[12.5px] text-member-text">
              <span>
                Not a member? <b>Join from ${join}/mo</b> to unlock this price.
              </span>
              <Link href="/membership" className="btn-gold btn-sm shrink-0">
                Join
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
