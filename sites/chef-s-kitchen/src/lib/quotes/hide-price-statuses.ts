import "server-only";
import { cache } from "react";
import { quoteStatusService } from "@keenan/services";
import { FALLBACK_HIDE_PRICE_STATUSES } from "./price-visibility";

/**
 * The statuses configured to hide prices, read from `quote_statuses` — the table
 * staff edit in portal settings. Used only as the FALLBACK for quotes whose own
 * `hide_prices` column is null (legacy rows); a quote that carries the flag always
 * wins. See `quoteHidesPrices`.
 *
 * One query per request (React `cache` dedupes it across the page's components).
 * If the table can't be read, degrade to the constant set — the same behaviour the
 * storefront had before it consulted the table at all, so a DB blip can never
 * expose prices that should be hidden.
 */
export const getHidePriceStatuses = cache(async (): Promise<ReadonlySet<string>> => {
  try {
    const rows = (await quoteStatusService.listActive()) as Array<{
      value?: string | null;
      hide_prices?: boolean | null;
    }>;
    const hiding = rows.filter((r) => r.hide_prices === true && r.value);
    // An empty/unseeded table would silently make every price visible — treat it
    // as "no usable configuration" and keep the safe default.
    if (hiding.length === 0) return FALLBACK_HIDE_PRICE_STATUSES;
    return new Set(hiding.map((r) => r.value as string));
  } catch (e) {
    console.error("[getHidePriceStatuses] falling back to defaults:", e);
    return FALLBACK_HIDE_PRICE_STATUSES;
  }
});
