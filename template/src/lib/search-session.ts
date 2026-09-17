// The storefront search SESSION id — the one opaque thing `search_log` records about a browser
// (card LjdIfc92).
//
// Pure: no next/headers, no services, no React. It is imported by the PROXY, which is bundled
// into middleware.js and may not pull in the data layer (see lib/guard/index.ts's import
// discipline), and by the search page, which reads the cookie back.
//
// WHY A COOKIE AT ALL. The log records "somebody typed this and clicked that". Without a session
// id, two searches by one shopper are indistinguishable from two shoppers, which is the first
// thing the Phase 2 analytics will want to tell apart. It is a random uuid and nothing else: no
// account, no contact, no email, no IP, no user-agent, no cross-site value.
//
// WHY ONLY ON /search. A visitor who never searches never gets one — the cookie is set by the
// proxy on the search route alone, so this is not a site-wide tracking cookie and nothing else
// on the storefront reads it.

/** Cookie name. Must match `SEARCH_SESSION_COOKIE` in @keenan/services/search. */
export const SEARCH_SESSION_COOKIE = "kg_sid";

/** 30 days — long enough to group a shopper's return visits, short enough to be forgettable. */
export const SEARCH_SESSION_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * A session id is echoed back to us from the browser, so it is untrusted text: an opaque token
 * of a sane length, or nothing at all. Same shape as the services-side check, deliberately
 * duplicated rather than imported — the proxy bundle may not reach the services package.
 */
export function isValidSearchSessionId(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length <= 64 && /^[A-Za-z0-9_-]{8,}$/.test(value);
}

/** A fresh opaque id. `crypto.randomUUID` exists in both the Node and the Edge runtime. */
export function newSearchSessionId(): string {
  return crypto.randomUUID();
}

/**
 * The `Set-Cookie` value for a new session id.
 *
 * `httpOnly` because nothing in the browser needs to read it — the click beacon sends the cookie
 * back by itself. `sameSite=lax` so a shopper arriving from a link still carries it; `secure`
 * everywhere but local http.
 */
export function searchSessionCookieValue(id: string, secure: boolean): string {
  const parts = [
    `${SEARCH_SESSION_COOKIE}=${id}`,
    "Path=/",
    `Max-Age=${SEARCH_SESSION_MAX_AGE}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/**
 * Add a cookie to a request's own `cookie` header, so the render this request is about to run
 * sees the id the proxy has just minted rather than logging its first search with none.
 */
export function withCookie(header: string | null, name: string, value: string): string {
  const existing = (header || "").trim();
  return existing ? `${existing}; ${name}=${value}` : `${name}=${value}`;
}
