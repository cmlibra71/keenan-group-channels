"use client";

import { createContext, useContext } from "react";
import { DEFAULT_FINANCE_RATES, type FinanceRates } from "@keenan/services/finance";

// ============================================================================
// The storefront's weekly-rent rates, handed to client components (6GBlDtwf).
//
// The product page's SilverChef panel is a sealed client native inside an
// authored tree — it cannot read channel settings itself, and it must quote the
// SAME rate as the checkout button, or the shopper meets two of our own controls
// disagreeing about one product (the failure `orderWeeklyRent` is fenced off
// for). So the rates are resolved once on the server and put in context.
//
// The default is the SHIPPED pair, so a tree rendered without the provider
// behaves exactly as it did before this setting existed rather than quoting $0.
// ============================================================================

const FinanceRatesContext = createContext<FinanceRates>(DEFAULT_FINANCE_RATES);

export function FinanceRatesProvider({
  rates,
  children,
}: {
  rates: FinanceRates;
  children: React.ReactNode;
}) {
  return <FinanceRatesContext.Provider value={rates}>{children}</FinanceRatesContext.Provider>;
}

export function useFinanceRates(): FinanceRates {
  return useContext(FinanceRatesContext);
}
