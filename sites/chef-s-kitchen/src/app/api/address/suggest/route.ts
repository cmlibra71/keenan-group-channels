import { NextResponse, type NextRequest } from "next/server";
import { googlePlacesService, getCheckoutSettings } from "@/lib/store";
import { enforceLimit, rateLimitResponse } from "@/lib/security/rate-limits";

/**
 * GET /api/address/suggest?q=…  — the checkout / address-book typeahead.
 *
 * A ROUTE, not a server action, and that is the point: a server action POSTs to
 * whatever page fired it, so on /checkout every keystroke-settle would land in
 * the middleware guard's credential budget and a shopper typing their shipping
 * and billing addresses could be handed a 429 mid-checkout. As a GET on /api it
 * sits on the ordinary `api` surface, carries its own `address_lookup` budget
 * (each call costs a Google Places lookup), and can answer a real 429 with
 * Retry-After.
 */
export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") || "").trim();
  if (query.length < 3) return NextResponse.json({ predictions: [] });

  const limit = await enforceLimit("address_lookup", { surface: "address suggest" });
  if (!limit.allowed) return rateLimitResponse(limit);

  try {
    const settings = await getCheckoutSettings();
    const countryCodes = settings.supportedCountries.map((c) => c.code.toLowerCase());
    const predictions = await googlePlacesService.autocomplete(query, countryCodes);
    return NextResponse.json({ predictions }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // A typeahead is a convenience: fail quiet and let them type the address.
    return NextResponse.json({ predictions: [] });
  }
}
