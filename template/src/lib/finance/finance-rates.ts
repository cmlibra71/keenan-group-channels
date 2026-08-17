import { cache } from "react";
import { resolveFinanceSettings, type FinanceRates } from "@keenan/services/finance";
import { getChannelSettings } from "@/lib/store";

// ============================================================================
// This storefront's weekly-rent RATES (card 6GBlDtwf).
//
// SilverChef 5.5% and SKOPE 3.625% used to be constants. They are per-channel
// settings now, edited on the portal's Settings -> Checkout, so a site can be
// re-rated without a deploy. Unset — or blank, or unparseable — keeps the rate
// that shipped: `resolveFinanceSettings` owns that rule and is shared with the
// portal and the checkout, so a cleared field can never be read as 0% here and
// as 5.5% somewhere else.
//
// It exists as its OWN reader rather than through `getCheckoutSettings` because
// the product page needs the rates on every product view and does not otherwise
// want the payment methods, the countries and the minimum-order settings. Both
// keys are read in a single batched query and the whole thing is cached per
// request, so mounting the provider in the root layout costs one round trip.
// ============================================================================

export const FINANCE_SILVERCHEF_RATE_SETTING_KEY = "finance_silverchef_rate";
export const FINANCE_SKOPE_RATE_SETTING_KEY = "finance_skope_rate";

/** The rates this storefront quotes at, or the ones that shipped. Never throws. */
export const financeRatesForChannel = cache(async (): Promise<FinanceRates> => {
  // ONE round trip, not one per rate: this runs in the ROOT LAYOUT, so it is on
  // the critical path of every page on the site — home, category, cart and all —
  // for a panel that only appears on product pages. An absent key is absent from
  // the map, which `resolveFinanceSettings` reads as "unset" and answers with the
  // rate that shipped.
  const rows = await getChannelSettings([
    FINANCE_SILVERCHEF_RATE_SETTING_KEY,
    FINANCE_SKOPE_RATE_SETTING_KEY,
  ]);
  return resolveFinanceSettings({
    standardRate: rows[FINANCE_SILVERCHEF_RATE_SETTING_KEY],
    skopeRate: rows[FINANCE_SKOPE_RATE_SETTING_KEY],
  }).rates;
});
