// Writing a storefront search to `search_log` (card LjdIfc92).
//
// The one place the search page reaches the log. Everything about it is best-effort: the write
// happens AFTER the results have been resolved, it swallows every error, and it returns `null`
// rather than throwing — a search must never be slower or less reliable because it is recorded.
//
// The Phase 2 half of the card (the search dashboard, zero-result reporting, keyword pin/boost,
// popular + recently-viewed blocks, the daily report email) reads this table. None of it is built,
// and none of it can report on a period the log does not cover, which is why this ships first.
import { cookies, headers } from "next/headers";
import { CHANNEL_ID } from "@/lib/channel";
import { SEARCH_SESSION_COOKIE, isValidSearchSessionId } from "@/lib/search-session";

/**
 * How long the page will wait for the log write before giving up on it.
 *
 * Swallowing every error covers a database that SAYS no; it does nothing about one that says
 * nothing at all. Without this, a stalled commerce-DB connection would hold a search page whose
 * results are already in hand — the one thing this feature must never do. When the timeout wins
 * the write may still land (we simply stop waiting for its id), so the row is not lost, only its
 * click stamp for that one render.
 */
const LOG_WRITE_TIMEOUT_MS = 750;

/**
 * Record one search and return the log row's id, or `null` if nothing was written.
 *
 * The id is handed to the results feed so a click on a result can stamp THIS search — one row per
 * search, the click-through on the same row rather than in a second table.
 *
 * `resultCount` is the SEARCH's own count (Meilisearch's total, or the Postgres fallback's), not
 * the tiles this shopper was shown: Phase 2's zero-result report has to mean "the catalogue
 * answered nothing", never "this account may not see them". On the Meilisearch path it is
 * `estimatedTotalHits` capped at the index's `maxTotalHits` — an ESTIMATE, and on a broad query a
 * round 1000 rather than a count. Zero is exact and trustworthy, which is the figure the
 * zero-result report needs; a non-zero one is a magnitude.
 */
export async function logStorefrontSearch(
  query: string,
  resultCount: number
): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const written = write(query, resultCount);
    const gaveUp = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), LOG_WRITE_TIMEOUT_MS);
      // Never hold the process open for a log row.
      (timer as { unref?: () => void }).unref?.();
    });
    return await Promise.race([written, gaveUp]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function write(query: string, resultCount: number): Promise<string | null> {
  try {
    const [{ logSearch }, cookieStore, headerStore] = await Promise.all([
      import("@keenan/services/search"),
      cookies(),
      headers(),
    ]);
    // A staff CMS preview is not a shopper's search. `/json/search?q=…` and `/render/search?q=…`
    // render the real page, so without this every side-by-side review of the search surface would
    // write a row into the analytics the Phase 2 reports are built on.
    if (headerStore.get("x-kg-json") || headerStore.get("x-cms-render")) return null;
    const sessionId = cookieStore.get(SEARCH_SESSION_COOKIE)?.value;
    return await logSearch({
      channelId: CHANNEL_ID,
      query,
      resultCount,
      sessionId: isValidSearchSessionId(sessionId) ? sessionId : null,
    });
  } catch {
    return null;
  }
}
