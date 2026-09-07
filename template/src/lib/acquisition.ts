import { cookies } from "next/headers";
import {
  ACQUISITION_COOKIE,
  acquisitionBagFromCookie,
} from "@/lib/acquisition-campaign";

/**
 * WHERE A SHOPPER CAME FROM — the server half, read when a quote is created.
 *
 * This module reads `next/headers` and so must NEVER be imported by `proxy.ts`: the pure
 * cookie logic the middleware needs lives in `@/lib/acquisition-campaign`, which imports
 * nothing at all. Keeping them apart is what stops the middleware bundle growing a
 * `next/headers` (and, through it, a data-layer) dependency on every request — the
 * import discipline recorded at the top of `lib/guard/index.ts`.
 *
 * Card T7Wclho8.
 */

/**
 * What this shopper's first touch was, for stamping on a quote. Null when they arrived
 * with no campaign on the address — most shoppers, most of the time.
 *
 * The bag is normalised AGAIN by `QuoteService.beforeCreate` before it is written, so
 * services' whitelist is the authority on what can reach the column.
 */
export async function readAcquisitionUtm(): Promise<Record<string, string> | null> {
  try {
    return acquisitionBagFromCookie((await cookies()).get(ACQUISITION_COOKIE)?.value);
  } catch {
    return null;
  }
}
