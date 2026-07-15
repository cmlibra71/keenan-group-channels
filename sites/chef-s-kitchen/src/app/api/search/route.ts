import { NextRequest, NextResponse } from "next/server";
import { searchProducts } from "@keenan/services/search";
import { shouldSuppressCatalogSalePrice } from "@/lib/store";
import { CHANNEL_ID } from "@/lib/channel";
import { applyCatalogScope } from "@/lib/catalog-scope";

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

    // L2 — the Meilisearch index is SHARED by every shopper and cannot encode per-account
    // visibility, so the viewer's scope is applied HERE, to the hits already returned by the index.
    // (estimatedTotalHits is the index's count and may over-count when a restricted product is
    // dropped — a count, never a leak: no restricted row is ever rendered.)
    const visible = await applyCatalogScope(result.hits as unknown as { id: number }[]);
    const dropped = result.hits.length - visible.length;
    if (dropped > 0) {
      result.hits = visible as unknown as typeof result.hits;
      result.estimatedTotalHits = Math.max(visible.length, result.estimatedTotalHits - dropped);
    }

    // Member-only pricing channels never expose the shared catalog sale price
    // (it's another channel's public price) — not even in search results.
    if (await shouldSuppressCatalogSalePrice()) {
      result.hits = result.hits.map((hit) =>
        "salePrice" in hit ? { ...hit, salePrice: null } : hit
      ) as typeof result.hits;
    }

    return NextResponse.json(result);
  } catch {
    // Meilisearch unavailable — return empty results with 503
    return NextResponse.json(
      { hits: [], query: q, estimatedTotalHits: 0, error: "Search temporarily unavailable" },
      { status: 503 }
    );
  }
}
