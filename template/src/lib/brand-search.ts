// The brand page's search box hands its query to the SITE search (`/search`),
// narrowed to that brand. There is deliberately NO second search implementation
// here: the results, the ranking, the facets, the catalogue scoping, the
// 320-result ceiling and the rate-limit budget are the ones `/search` already
// applies, so a shopper searching from a brand page gets the same answers as a
// shopper searching from the header. (Card 1RLP5nSJ.)
//
// Pure, shared and byte-identical across template/ and every site (listed in
// orchestrator/shared-modules.json) — the per-site part is only how the box
// LOOKS.

/**
 * The value to put in the `brand` query parameter so `/search` narrows to this
 * brand AND draws it as the ticked brand facet.
 *
 * It has to be built exactly the way the facet rail builds it or the two
 * disagree: `FacetRail`'s option value is `encodeURIComponent(name)` and the
 * URL then encodes that again, so the query string carries the name
 * DOUBLE-encoded. That is not decoration — `sanitizeFacetValues`
 * (`lib/search-results.ts`) splits the parameter on commas before it decodes,
 * because brand and category facet values are free-form names that may contain
 * one, so a raw name like "Smith, Jones" would arrive as two facet values and
 * match no brand at all. Encoding here, and letting the form or the
 * URLSearchParams encode again, is what makes the round trip lossless.
 */
export function brandFacetValue(brandName: string): string {
  return encodeURIComponent(brandName);
}

/**
 * `/search` for one query, narrowed to one brand — the address the brand-page
 * search box submits to. The form itself submits a plain GET so it works with
 * no JavaScript; this is the same address in one string, for links.
 */
export function brandSearchHref(brandName: string, query: string): string {
  const params = new URLSearchParams();
  params.set("q", query);
  params.set("brand", brandFacetValue(brandName));
  return `/search?${params.toString()}`;
}
