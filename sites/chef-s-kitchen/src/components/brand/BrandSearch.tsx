import Link from "next/link";
import { Search } from "lucide-react";
import { brandFacetValue } from "@/lib/brand-search";
import { MAX_QUERY_LENGTH } from "@/lib/search-results";

/**
 * The search box on a brand page (card 1RLP5nSJ, Fiona/Tim).
 *
 * It is a plain GET form pointed at `/search`, carrying this brand as the
 * `brand` facet parameter — so the results, the ranking and the facets are the
 * SITE search (Meilisearch through `searchProducts`), not a second search built
 * for this page. A shopper who searches from a brand page gets that brand's
 * products; the results page then draws the brand as a ticked facet with an ×,
 * so widening the search back out to the whole catalogue is one click, and the
 * line under the box says so before they even search.
 *
 * A form rather than a client component on purpose: it needs no JavaScript, and
 * the typeahead dropdown cannot help here — `/api/search` deliberately accepts
 * no filter parameter (see `lib/search-params.ts`), so brand-scoped suggestions
 * would mean widening a public endpoint that was narrowed on purpose.
 */
export function BrandSearch({ brandName }: { brandName: string }) {
  return (
    <section className="mb-10">
      <form action="/search" method="get" role="search" className="flex flex-col gap-2 sm:flex-row">
        {/* Double-encoded on purpose — see brandFacetValue. */}
        <input type="hidden" name="brand" value={brandFacetValue(brandName)} />
        <div className="relative flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-steel-400"
          />
          <input
            type="search"
            name="q"
            required
            maxLength={MAX_QUERY_LENGTH}
            autoComplete="off"
            aria-label={`Search ${brandName} products`}
            placeholder={`Search ${brandName} products…`}
            className="w-full rounded-lg border border-border py-3 pl-10 pr-3 text-sm focus:border-accent focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-accent px-6 py-3 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Search
        </button>
      </form>
      <p className="mt-2 text-xs text-steel-500">
        Searching {brandName} only.{" "}
        <Link href="/search" className="underline hover:text-accent">
          Search all products
        </Link>
      </p>
    </section>
  );
}
