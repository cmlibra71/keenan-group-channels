"use client";

import Link from "next/link";
import { Star, ArrowRight } from "lucide-react";
import { useGst, adjustForGst } from "@/lib/gst";

/**
 * Design-system pricing block — the single component that renders the trade
 * pricing model in all four states (member/guest × ex/inc GST) so cards, PDP
 * and cart never diverge.
 *
 *  Member:  $6,641.00 ex GST   /  RRP ~~$8,250.00~~ · ★ Member saves $1,609 (≈20%)
 *  Guest:   $8,250.00 ex GST   /  gold "Join from $14.95/mo → pay $6,641" funnel
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
  /** Standard / RRP price (ex GST). */
  rrp: number;
  /** Base member price (ex GST) — computed for guests too (join funnel). */
  memberPrice?: number | null;
  isMember?: boolean;
  /** Monthly plan price for the guest "Join from $X/mo" line. */
  planPrice?: string | null;
  size?: "card" | "pdp";
  className?: string;
}) {
  const { inclusive, pricesIncludeTax } = useGst();
  const adj = (n: number) => adjustForGst(n, inclusive, pricesIncludeTax);
  const fmt = (n: number) =>
    `$${adj(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtRound = (n: number) =>
    `$${Math.round(adj(n)).toLocaleString("en-AU")}`;
  const gstLabel = inclusive ? "inc GST" : "ex GST";

  const hasMemberDeal = memberPrice != null && memberPrice > 0 && memberPrice < rrp;
  const big = size === "pdp" ? "text-[33px]" : "text-lg";
  const savings = hasMemberDeal ? rrp - memberPrice! : 0;
  const savingsPct = hasMemberDeal ? Math.round((savings / rrp) * 100) : 0;

  // No price at all → caller should render its own POA treatment.
  if (!Number.isFinite(rrp) || rrp <= 0) return null;

  if (isMember && hasMemberDeal) {
    return (
      <div className={className}>
        <div className="flex items-baseline gap-2">
          <span className={`${big} font-bold leading-none tracking-tight text-text-primary`}>
            {fmt(memberPrice!)}
          </span>
          <span className="text-xs font-semibold text-steel-500">{gstLabel}</span>
        </div>
        <p className={`mt-1 text-[13px] text-steel-500 ${size === "card" ? "text-xs" : ""}`}>
          RRP <s className="text-steel-400">{fmt(rrp)}</s>
        </p>
        <p className={`mt-0.5 flex items-center gap-1 font-semibold text-member-text ${size === "card" ? "text-xs" : "text-[13px]"}`}>
          <Star className="h-3 w-3 fill-current" />
          Member saves {fmtRound(savings)} (≈{savingsPct}%)
        </p>
      </div>
    );
  }

  // Guest / non-member
  return (
    <div className={className}>
      <div className="flex items-baseline gap-2">
        <span className={`${big} font-bold leading-none tracking-tight text-text-primary`}>
          {fmt(rrp)}
        </span>
        <span className="text-xs font-semibold text-steel-500">{gstLabel}</span>
      </div>
      {hasMemberDeal && (
        size === "pdp" ? (
          <Link
            href="/membership"
            className="mt-3.5 flex items-center justify-between gap-2.5 rounded-btn bg-member-bg px-3.5 py-[11px] text-[12.5px] font-medium text-member-text transition-colors hover:bg-member-bright/40"
          >
            <span>
              Join from ${planPrice ? parseFloat(planPrice).toFixed(2) : "14.95"}/mo →
              pay <b>{fmt(memberPrice!)}</b>
            </span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0" />
          </Link>
        ) : (
          <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-member-text">
            <Star className="h-3 w-3 fill-current" />
            Members pay {fmt(memberPrice!)}
          </p>
        )
      )}
    </div>
  );
}
