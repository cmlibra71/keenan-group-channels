import { GONE_BODY_PATH, selfOrigin } from "@/lib/gone-paths";

/**
 * The 410 Gone response (WP2-k). The proxy rewrites a Gone address here
 * (lib/gone-paths.ts); an App Router page cannot answer 410 (a rewrite's
 * status is replaced by the page's own 404), so this handler serves the site's
 * own not-found page HTML with status 410 — the visitor sees the normal site
 * page, search engines see "gone". The HTML is fetched from this server once
 * and kept for 5 minutes, so a crawler re-checking gone addresses costs no
 * extra renders.
 */
const TTL_MS = 5 * 60 * 1000;
let cached: { html: string; at: number } | null = null;

async function goneHtml(port: string): Promise<string> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.html;
  let html = "<!doctype html><title>Gone</title><h1>This page has been removed.</h1>";
  try {
    const res = await fetch(`${selfOrigin(port)}${GONE_BODY_PATH}`, {
      cache: "no-store",
      headers: { "user-agent": "kg-gone-page" },
      signal: AbortSignal.timeout(3000),
    });
    const body = await res.text();
    if (body) html = body;
    cached = { html, at: Date.now() };
  } catch {
    // fall back to the minimal body; retry on the next request
  }
  return html;
}

export async function GET(req: Request) {
  const html = await goneHtml(new URL(req.url).port);
  return new Response(html, {
    status: 410,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
}

export const HEAD = GET;
