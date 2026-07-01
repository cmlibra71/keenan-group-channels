// Pure home for the GST-inclusive preference cookie — the name and the
// serialize/parse convention in ONE place, shared by the client toggle
// (gst.tsx, which writes it) and the SSR read (layout.tsx, which reads it back so
// prices render without a flash). No React, no next/headers, so it is unit-testable
// (see gst-cookie.test.ts).

export const GST_COOKIE = "gst_inclusive";
const ONE_YEAR_SECONDS = 31536000;

/** The document.cookie value string for the GST-inclusive preference. */
export function serializeGstCookie(inclusive: boolean): string {
  return `${GST_COOKIE}=${inclusive}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}

/** Reads the stored preference; only the literal "true" means inclusive. */
export function parseGstInclusive(value: string | undefined): boolean {
  return value === "true";
}
