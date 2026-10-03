/**
 * The 410 Gone response (WP2-k). The proxy rewrites a Gone address here
 * (lib/gone-paths.ts); an App Router page cannot answer 410 (a rewrite's
 * status is replaced by the page's own 404), so this handler fetches the
 * site's own not-found page over loopback and serves its HTML with status 410
 * — the visitor sees the normal site page, search engines see "gone".
 */
export async function GET(req: Request) {
  const port = process.env.PORT || new URL(req.url).port || "3000";
  let html = "<!doctype html><title>Gone</title><h1>This page has been removed.</h1>";
  try {
    const res = await fetch(`http://127.0.0.1:${port}/__kg-gone__`, {
      cache: "no-store",
      headers: { "user-agent": "kg-gone-page" },
    });
    const body = await res.text();
    if (body) html = body;
  } catch {
    // fall back to the minimal body
  }
  return new Response(html, {
    status: 410,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
}

export const HEAD = GET;
