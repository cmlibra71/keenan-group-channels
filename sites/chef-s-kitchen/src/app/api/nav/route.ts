import { NextRequest, NextResponse } from "next/server";
import { loadNavData } from "@/lib/nav-data";

export const dynamic = "force-dynamic";

/**
 * The header drop-downs' data (lib/nav-model.ts), fetched by the browser once
 * per menu version instead of being rendered into every page.
 *
 * The page asks for `?v=<version>`, a hash of the data. When that is still the
 * current version the response can never change, so the browser keeps it for
 * good; a stale version (the menu was edited since the page rendered) gets the
 * current data uncached. Channel-wide and identical for every visitor — no
 * prices, no session — so a shared cache is fine.
 */
export async function GET(request: NextRequest) {
  const { data, version } = await loadNavData();
  const current = request.nextUrl.searchParams.get("v") === version;
  return NextResponse.json(
    { version, data },
    { headers: { "Cache-Control": current ? "public, max-age=31536000, immutable" : "no-store" } }
  );
}
