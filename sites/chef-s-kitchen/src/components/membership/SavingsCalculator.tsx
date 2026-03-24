"use client";

import { useState } from "react";

const presets = [200, 500, 1000, 2000];

export function SavingsCalculator({
  discountPercent = 15,
  monthlyPlanPrice,
}: {
  discountPercent?: number;
  monthlyPlanPrice: number;
}) {
  const [spend, setSpend] = useState(500);

  const monthlySavings = spend * (discountPercent / 100);
  const annualSavings = monthlySavings * 12;
  const annualFee = monthlyPlanPrice * 12;
  const netSavings = annualSavings - annualFee;

  return (
    <div className="space-y-8">
      <div>
        <label className="field-label mb-4">
          What do you spend per month on kitchen equipment?
        </label>
        <div className="flex flex-wrap gap-2">
          {presets.map((amount) => (
            <button
              key={amount}
              onClick={() => setSpend(amount)}
              className={`px-5 py-2.5 text-sm font-medium transition-colors duration-300 ${
                spend === amount
                  ? "bg-surface-dark text-white"
                  : "bg-white border border-border text-text-body hover:border-text-primary/30"
              }`}
            >
              ${amount.toLocaleString()}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card-padded text-center">
          <p className="heading-sans text-text-muted tracking-widest mb-2">Retail cost</p>
          <p className="text-xl font-medium text-text-primary">
            ${(spend * 12).toLocaleString()}<span className="text-sm font-normal text-text-secondary">/yr</span>
          </p>
        </div>
        <div className="card-padded text-center">
          <p className="heading-sans text-text-muted tracking-widest mb-2">Member cost</p>
          <p className="text-xl font-medium text-accent-dark">
            ${((spend * 12) - annualSavings + annualFee).toLocaleString()}<span className="text-sm font-normal text-text-secondary">/yr</span>
          </p>
        </div>
        <div className="border border-accent/30 bg-surface-primary p-6 text-center">
          <p className="heading-sans text-accent tracking-widest mb-2">You save</p>
          <p className="text-xl font-medium text-accent">
            {netSavings > 0 ? `$${netSavings.toLocaleString()}` : "$0"}<span className="text-sm font-normal text-accent-dark">/yr</span>
          </p>
        </div>
      </div>

      <p className="caption text-center">
        Based on {discountPercent}% average member discount. Membership fee: ${monthlyPlanPrice.toFixed(2)}/month (${annualFee.toFixed(2)}/year).
      </p>
    </div>
  );
}
