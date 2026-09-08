/**
 * WHERE A SHOPPER CAME FROM — the pure half, and the ONLY half the proxy may import.
 *
 * IMPORT DISCIPLINE (enforce in review, same rule as `lib/guard/index.ts`): this module
 * is bundled into `.next/server/middleware.js`, so it imports NOTHING — not
 * `next/headers`, not `@keenan/services`, not `@/lib/store`. Pulling any of those in
 * would drag the data layer into the middleware bundle and inflate cold start on every
 * single request to the storefront. Verify with:
 *   grep -c postgres .next/server/middleware.js   # must be 0
 *
 * That is why the seven-key whitelist and the length cap are spelled out here rather
 * than imported from `@keenan/services/quote-acquisition`. They are deliberately the
 * SAME seven keys and the same 300-character cap, and they are not the authority:
 * `QuoteService.beforeCreate` re-runs `normalizeQuoteAcquisitionUtm` over whatever is
 * handed to it, so the column can only ever hold what services allows. This copy is the
 * cheap defensive filter that keeps an email address or a session token out of a cookie
 * in the first place. If the services list ever changes, change this list with it.
 *
 * FIRST TOUCH WINS, and that is the whole design: the visit that carried the utm_*
 * parameters is the one marketing paid for. A shopper who arrives on an ad, browses
 * away, comes back through a bookmark and only then builds a quote must still be
 * credited to that ad — re-stamping on the second visit would quietly re-attribute every
 * such quote to "no campaign" (card T7Wclho8).
 */

export const ACQUISITION_COOKIE = "kg_acq";

/** 90 days — long enough to cover a considered B2B purchase, short enough to expire. */
export const ACQUISITION_MAX_AGE = 60 * 60 * 24 * 90;

/**
 * The marketing keys the cookie keeps, and nothing else. Mirrors
 * `QUOTE_ACQUISITION_UTM_KEYS` in `@keenan/services/quote-acquisition`, which is the
 * authority applied again at write time.
 */
export const ACQUISITION_UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "referrer",
  "landing_path",
] as const;

/** Per-value cap, mirroring services. Ad platforms emit long campaign strings. */
const UTM_VALUE_MAX_LENGTH = 300;

const KEYS: readonly string[] = ACQUISITION_UTM_KEYS;

/**
 * The whitelisted, trimmed, capped bag — or null when nothing survives, so "no
 * campaign" is one state rather than two. Never throws.
 */
export function normalizeCampaignBag(input: unknown): Record<string, string> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const out: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(input as Record<string, unknown>)) {
    const key = rawKey.trim().toLowerCase();
    if (!KEYS.includes(key)) continue;
    const value = String(rawValue ?? "")
      .trim()
      .slice(0, UTM_VALUE_MAX_LENGTH);
    if (!value) continue;
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * The bag worth remembering for this request, or null when there is nothing.
 *
 * Only a request actually CARRYING utm_* parameters is worth a cookie: a referrer alone
 * is every internal click and every organic visit, so storing that would fill the column
 * with noise and read as an acquisition source we never bought.
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
  return normalizeCampaignBag(raw);
}

/**
 * The bag inside a stored cookie value, or null when there is nothing readable in it.
 *
 * The ENCODING is the fiddly part: the proxy percent-encodes the JSON and Next
 * percent-encodes the cookie again on the way out, so the value that comes back can
 * carry one layer or two depending on who read it. It is unwrapped until it parses
 * rather than a fixed number of times, and anything that still will not parse is treated
 * as no campaign at all.
 *
 * Never throws. An unreadable or tampered cookie must cost nobody their quote.
 */
export function acquisitionBagFromCookie(raw: string | undefined): Record<string, string> | null {
  if (!raw) return null;
  let value = raw;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return normalizeCampaignBag(JSON.parse(value) as unknown);
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
