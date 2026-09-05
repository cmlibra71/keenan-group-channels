"use client";

import Link from "next/link";
import { useState } from "react";

export interface MembershipPlanOption {
  slug: string;
  /** "month" | "year" — what the fee buys. */
  interval: string;
  /** GST-inclusive fee, as stored. */
  price: number;
  href: string;
  label: string;
}

const money = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  minimumFractionDigits: 2,
});

/**
 * The membership fee card: the plans this channel actually sells, the fee, and
 * the join CTA (card gk23c1VK).
 *
 * The yearly saving is computed from the two REAL fees — twelve monthly
 * payments against the yearly one — and floored to one decimal so it is never
 * overstated. It is a fact about the fee, not a claim about product prices, and
 * it is the only percentage allowed anywhere on this page: the catalogue has no
 * single saving figure and none is published until the M-to-R spread has been
 * measured (blueprint §10, §13).
 *
 * The toggle appears only when the channel really sells both plans. A yearly
 * button that led nowhere would be worse than no yearly button.
 */
export function PlanChoice({
  plans,
  ctaLabel,
  note,
}: {
  plans: MembershipPlanOption[];
  ctaLabel: string;
  note?: string;
}) {
  const monthly = plans.find((p) => p.interval === "month") ?? null;
  const yearly = plans.find((p) => p.interval === "year") ?? null;
  const [choice, setChoice] = useState<"month" | "year">(monthly ? "month" : "year");

  const active = (choice === "year" ? yearly : monthly) ?? plans[0] ?? null;
  if (!active) return null;

  const twelveMonths = monthly ? monthly.price * 12 : null;
  const yearlySavingPct =
    yearly && twelveMonths && twelveMonths > 0
      ? Math.floor(((twelveMonths - yearly.price) / twelveMonths) * 1000) / 10
      : null;

  const terms =
    active.interval === "year"
      ? yearlySavingPct && yearlySavingPct > 0
        ? `${yearlySavingPct.toFixed(1)}% less than monthly · cancel any time`
        : "Billed yearly · cancel any time"
      : "Month to month · cancel any time";

  return (
    <div className="rounded-2xl border border-border-strong bg-white p-6 text-center sm:p-8">
      <p className="eyebrow mb-4">Members Spend More, Save More</p>

      {monthly && yearly && (
        <div
          role="group"
          aria-label="Billing period"
          className="mx-auto mb-6 inline-flex rounded-full border border-border-strong p-1"
        >
          <button
            type="button"
            onClick={() => setChoice("month")}
            aria-pressed={choice === "month"}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              choice === "month" ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setChoice("year")}
            aria-pressed={choice === "year"}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              choice === "year" ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Yearly{yearlySavingPct ? ` · save ${yearlySavingPct.toFixed(0)}%` : ""}
          </button>
        </div>
      )}

      <p className="heading-serif text-4xl text-text-primary">
        {money.format(active.price)}
        <span className="text-base font-normal text-text-secondary"> / {active.interval}</span>
      </p>
      <p className="mt-1 text-xs text-text-secondary">{terms} · GST included</p>

      <Link href={active.href} className="btn-primary mt-6 w-full">
        {ctaLabel}
      </Link>

      <p className="mt-4 text-xs leading-relaxed text-text-secondary">
        Cancel any time, no lock-in. No contract, no exit fee, no notice period.
      </p>
      <p className="mt-2 text-xs leading-relaxed text-text-secondary">
        You always get the better price. Where a clearance or Partner Special is sharper than your
        level, you get that instead.
      </p>
      {note && <p className="mt-2 text-xs leading-relaxed text-text-secondary">{note}</p>}
    </div>
  );
}
