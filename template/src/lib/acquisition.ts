import { cookies } from "next/headers";
import { normalizeQuoteAcquisitionUtm } from "@keenan/services/quote-acquisition";

/**
 * WHERE A SHOPPER CAME FROM, remembered from their first page on this site so the
 * quote they raise ten minutes (or ten days) later can say which campaign produced it
 * (card T7Wclho8).
 *
 * FIRST TOUCH WINS, and that is the whole design: the visit that carried the utm_*
 * parameters is the one marketing paid for. A shopper who arrives on an ad, browses
 * away, comes back through a bookmark and only then builds a quote must still be
 * credited to that ad — re-stamping on the second visit would quietly re-attribute every
 * such quote to "no campaign".
 *
 * The cookie is httpOnly and holds nothing but the seven whitelisted marketing keys,
 * because a landing address can carry an email address or a token and this value is read
 * back onto a staff screen.
 */
export const ACQUISITION_COOKIE = "kg_acq";

/** 90 days — long enough to cover a considered B2B purchase, short enough to expire. */
export const ACQUISITION_MAX_AGE = 60 * 60 * 24 * 90;

/**
 * The bag worth remembering for this request, or null when there is nothing.
 *
 * Pure and exported for its own test. Only a request actually CARRYING utm_* parameters
 * is worth a cookie: a referrer alone is every internal click and every organic visit,
 * so storing that would fill the column with noise and read as an acquisition source we
 * never bought.
 */
export function acquisitionBagFromRequest(
  url: URL,
  referrer: string | null
): Record<string, string> | null {
  const hasUtm = [...url.searchParams.keys()].some((k) => k.toLowerCase().startsWith("utm_"));
  if (!hasUtm) return null;
  const raw: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) raw[k] = v;
  if (referrer) raw.referrer = referrer;
  raw.landing_path = url.pathname;
  // The whitelist, the trim and the length cap all live in one place in services, so the
  // storefront cookie and the portal's own form can never disagree about what is kept.
  const bag = normalizeQuoteAcquisitionUtm(raw);
  return bag ? (bag as Record<string, string>) : null;
}

/**
 * The bag inside a stored cookie value, or null when there is nothing readable in it.
 *
 * Pure and exported for its own test, because the ENCODING is the fiddly part: the proxy
 * percent-encodes the JSON and Next percent-encodes the cookie again on the way out, so
 * the value that comes back can carry one layer or two depending on who read it. It is
 * unwrapped until it parses rather than a fixed number of times, and anything that still
 * will not parse is treated as no campaign at all.
 *
 * Never throws. An unreadable or tampered cookie must cost nobody their quote.
 */
export function acquisitionBagFromCookie(raw: string | undefined): Record<string, string> | null {
  if (!raw) return null;
  let value = raw;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const bag = normalizeQuoteAcquisitionUtm(JSON.parse(value) as unknown);
      return bag ? (bag as Record<string, string>) : null;
    } catch {
      let decoded: string;
      try {
        decoded = decodeURIComponent(value);
      } catch {
        return null;
      }
      if (decoded === value) return null;
      value = decoded;
    }
  }
  return null;
}

/**
 * What this shopper's first touch was, for stamping on a quote. Null when they arrived
 * with no campaign on the address — most shoppers, most of the time.
 */
export async function readAcquisitionUtm(): Promise<Record<string, string> | null> {
  try {
    return acquisitionBagFromCookie((await cookies()).get(ACQUISITION_COOKIE)?.value);
  } catch {
    return null;
  }
}
