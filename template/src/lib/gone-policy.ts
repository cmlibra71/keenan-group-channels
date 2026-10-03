// Per-site (NOT a shared module): whether this storefront answers url_redirects
// rows with status 410 as HTTP 410 Gone in the proxy (WP2-k). Imports nothing —
// the proxy's import list is closed (proxy.test.ts).
export const GONE_FROM_DATA = true;
