import { normalizeLookupPath } from "./redirect-path";

// ============================================================================
// HTTP 410 Gone from data (WP2-k). `url_redirects` rows with status 410 (no
// target) name addresses removed for good. The proxy answers them with the
// site's not-found page and status 410 — something an App Router page cannot
// do (notFound() is 404 only).
//
// The proxy is a closed import list (see proxy.test.ts), so this module
// imports only the pure path normaliser and reads the list over loopback from
// the site's own /api/internal/gone-paths (a cached DB read). It keeps the set
// in memory: a request NEVER waits on the database — after the first load the
// set refreshes in the background every 5 minutes, so a newly added or removed
// row takes effect within ~5–10 minutes (the route's own cache is 5 min).
// Until the first load completes (bounded to 1.5 s) an address is not gone.
// ============================================================================

const TTL_MS = 5 * 60 * 1000;
const FIRST_LOAD_TIMEOUT_MS = 1500;
const FETCH_TIMEOUT_MS = 3000;

/** The internal page the gone route renders for its body — never itself gone. */
export const GONE_BODY_PATH = "/__kg-gone__";

/**
 * This server's own address. Next standalone binds to $HOSTNAME (Docker sets it
 * to the container id, which resolves to the container's IP) or 0.0.0.0, so
 * the loopback must use the same host — 127.0.0.1 is NOT listening in the
 * production containers.
 */
export function selfOrigin(port: string | undefined): string {
  const h = process.env.HOSTNAME;
  const host = h && h !== "0.0.0.0" && h !== "::" ? h : "127.0.0.1";
  return `http://${host}:${port || process.env.PORT || "3000"}`;
}

let paths: Set<string> | null = null;
let loadedAt = 0;
let inflight: Promise<void> | null = null;

/** The pure decision, for tests. */
export function isGoneIn(set: Set<string> | null, pathname: string): boolean {
  if (!set || set.size === 0) return false;
  const p = normalizeLookupPath(pathname);
  return !!p && set.has(p);
}

/** Paths the proxy never treats as gone (its own data source, framework, APIs). */
export function goneCandidate(pathname: string, method: string): boolean {
  if (method !== "GET" && method !== "HEAD") return false;
  if (pathname === GONE_BODY_PATH) return false;
  return !pathname.startsWith("/api/") && !pathname.startsWith("/_next/");
}

function refresh(origin: string): Promise<void> {
  if (!inflight) {
    inflight = (async () => {
      try {
        const res = await fetch(`${origin}/api/internal/gone-paths`, {
          cache: "no-store",
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        const list = res.ok ? ((await res.json()) as unknown) : null;
        if (Array.isArray(list)) {
          paths = new Set(list.map((p) => normalizeLookupPath(String(p))).filter((p): p is string => !!p));
        }
      } catch {
        // keep the previous set
      } finally {
        // A failed FIRST load still settles to an empty set, so the next try
        // waits for the 5-minute schedule instead of every request retrying.
        if (paths === null) paths = new Set();
        loadedAt = Date.now();
        inflight = null;
      }
    })();
  }
  return inflight;
}

/** Whether `pathname` is a Gone address. `origin` = this server over loopback. */
export async function isGonePath(pathname: string, origin: string): Promise<boolean> {
  if (paths === null) {
    await Promise.race([refresh(origin), new Promise((r) => setTimeout(r, FIRST_LOAD_TIMEOUT_MS))]);
  } else if (Date.now() - loadedAt > TTL_MS) {
    void refresh(origin);
  }
  return isGoneIn(paths, pathname);
}
