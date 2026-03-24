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
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-3">
          What do you spend per month on kitchen equipment?
        </label>
        <div className="flex flex-wrap gap-2">
          {presets.map((amount) => (
            <button
              key={amount}
              onClick={() => setSpend(amount)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                spend === amount
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
              }`}
            >
              ${amount.toLocaleString()}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border border-zinc-200 p-4 text-center">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Retail cost</p>
          <p className="text-xl font-bold text-zinc-900">
            ${(spend * 12).toLocaleString()}<span className="text-sm font-normal text-zinc-500">/yr</span>
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4 text-center">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Member cost</p>
          <p className="text-xl font-bold text-green-700">
            ${((spend * 12) - annualSavings + annualFee).toLocaleString()}<span className="text-sm font-normal text-zinc-500">/yr</span>
          </p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-center">
          <p className="text-xs text-amber-700 uppercase tracking-wider mb-1">You save</p>
          <p className="text-xl font-bold text-amber-700">
            {netSavings > 0 ? `$${netSavings.toLocaleString()}` : "$0"}<span className="text-sm font-normal text-amber-600">/yr</span>
          </p>
        </div>
      </div>

      <p className="text-xs text-zinc-500 text-center">
        Based on {discountPercent}% average member discount. Membership fee: ${monthlyPlanPrice.toFixed(2)}/month (${annualFee.toFixed(2)}/year).
      </p>
    </div>
  );
}
