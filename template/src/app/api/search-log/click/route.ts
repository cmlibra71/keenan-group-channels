import { NextRequest, NextResponse } from "next/server";

/**
 * "The shopper opened this result." (card LjdIfc92)
 *
 * A beacon from the search results feed, stamping `clicked_product_id` onto the `search_log` row
 * the results came from. One row per search, the click on the SAME row — a search and the result
 * it led to are one event, so Phase 2's click-through rate is `count(clicked_product_id)/count(*)`
 * and never a join.
 *
 * WHAT THIS CAN AND CANNOT DO. It takes a search-log id (a uuid the server minted and handed to
 * that one page render) and a product id, and it can only ever set the product on a row that
 * exists and has not been stamped yet — `recordSearchClick` is first-click-wins. It cannot create
 * a row, cannot change one twice, and cannot read anything back: the answer is 204 whatever
 * happened, so it is not an oracle for which uuids exist. It is on the ordinary `api` rate-limit
 * budget (lib/guard/surfaces.ts), deliberately NOT the tight `search` one — a click beacon must
 * never spend the allowance a shopper needs to keep scrolling their results.
 *
 * Best-effort throughout, like the search log itself: a failure here costs one analytics row and
 * nothing else, so nothing is reported to the browser and nothing is retried.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { id?: unknown; productId?: unknown };
    const { recordSearchClick } = await import("@keenan/services/search");
    await recordSearchClick(String(body?.id ?? ""), Number(body?.productId));
  } catch {
    // Malformed body, a database that has not had the migration, Meili, anything — ignored.
  }
  // Always 204, always uncached.
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
