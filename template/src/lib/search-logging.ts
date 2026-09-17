// Writing a storefront search to `search_log` (card LjdIfc92).
//
// The one place the search page reaches the log. Everything about it is best-effort: the write
// happens AFTER the results have been resolved, it swallows every error, and it returns `null`
// rather than throwing — a search must never be slower or less reliable because it is recorded.
//
// The Phase 2 half of the card (the search dashboard, zero-result reporting, keyword pin/boost,
// popular + recently-viewed blocks, the daily report email) reads this table. None of it is built,
// and none of it can report on a period the log does not cover, which is why this ships first.
import { cookies } from "next/headers";
import { CHANNEL_ID } from "@/lib/channel";
import { SEARCH_SESSION_COOKIE, isValidSearchSessionId } from "@/lib/search-session";

/**
 * Record one search and return the log row's id, or `null` if nothing was written.
 *
 * The id is handed to the results feed so a click on a result can stamp THIS search — one row per
 * search, the click-through on the same row rather than in a second table.
 *
 * `resultCount` is the SEARCH's own count (Meilisearch's total, or the Postgres fallback's), not
 * the tiles this shopper was shown: Phase 2's zero-result report has to mean "the catalogue
 * answered nothing", never "this account may not see them".
 */
export async function logStorefrontSearch(
  query: string,
  resultCount: number
): Promise<string | null> {
  try {
    const [{ logSearch }, cookieStore] = await Promise.all([
      import("@keenan/services/search"),
      cookies(),
    ]);
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
