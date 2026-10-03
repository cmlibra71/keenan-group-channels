import { getGonePaths } from "@/lib/store";

/**
 * GET /api/internal/gone-paths — the addresses this storefront answers with
 * HTTP 410 (url_redirects rows with status 410). Read by the proxy over
 * loopback (lib/gone-paths.ts); cached 5 min in the channel store. Public data
 * (the same addresses already answer 410 to anyone), so no secret.
 */
export async function GET() {
  const paths = await getGonePaths().catch(() => [] as string[]);
  return Response.json(paths, { headers: { "cache-control": "no-store" } });
}
