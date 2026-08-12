import { NextResponse, type NextRequest } from "next/server";
import { googlePlacesService } from "@/lib/store";
import { enforceLimit, rateLimitResponse } from "@/lib/security/rate-limits";

/**
 * GET /api/address/details?placeId=…  — the chosen suggestion, expanded.
 *
 * Same reasoning as ./suggest: a route rather than a server action, so picking
 * an address never spends the shopper's credential budget on /checkout.
 */
export async function GET(request: NextRequest) {
  const placeId = (request.nextUrl.searchParams.get("placeId") || "").trim();
  if (!placeId) return NextResponse.json({ address: null });

  const limit = await enforceLimit("address_lookup", { surface: "address details" });
  if (!limit.allowed) return rateLimitResponse(limit);

  try {
    const address = await googlePlacesService.getPlaceDetails(placeId);
    return NextResponse.json({ address }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ address: null });
  }
}
