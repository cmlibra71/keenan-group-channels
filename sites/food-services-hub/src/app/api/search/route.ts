import { NextRequest, NextResponse } from "next/server";
import { searchProducts } from "@keenan/services/search";

const CHANNEL_ID = parseInt(process.env.CHANNEL_ID || "1", 10);

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q")?.trim() || "";
  const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);
  const offset = parseInt(searchParams.get("offset") || "0", 10);
  const filter = searchParams.get("filter") || undefined;
  const sort = searchParams.get("sort")?.split(",").filter(Boolean) || undefined;
  const facets = searchParams.get("facets")?.split(",").filter(Boolean) || undefined;

  if (!q) {
    return NextResponse.json({ hits: [], query: "", estimatedTotalHits: 0 });
  }

  try {
    const result = await searchProducts(CHANNEL_ID, q, {
      limit,
      offset,
      filter,
      sort,
      facets,
    });

    return NextResponse.json(result);
  } catch {
    // Meilisearch unavailable — return empty results with 503
    return NextResponse.json(
      { hits: [], query: q, estimatedTotalHits: 0, error: "Search temporarily unavailable" },
      { status: 503 }
    );
  }
}
