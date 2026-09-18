import { redirect } from "next/navigation";
import { redirectIfMapped } from "@/lib/redirect-seam";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  getBrandBySlug,
  getCategoryBySlug,
  getProducts,
  getFeatureFlag,
  getDefaultListingSort,
} from "@/lib/store";
import type { ListingSort } from "@/lib/listing-sort";
import { categorySlugCandidates } from "@/lib/legacy-address";
import { getListingMemberPrices } from "@/lib/member";
import { ProductGrid } from "@/components/product/ProductGrid";

// Brand + category combo page: renders the brand's products filtered to a
// specific category. Mirrors the original Zoey URL pattern
// /brands/<brand>/<category-slug>. Uses the SAME PDP/category template
// pattern — no new design, just a new filter combination.
/** The first of the legacy spellings of `last` that names a real category on
 *  this storefront — tried in order, and only as far as the first hit, so the
 *  ordinary case is the one lookup it has always been. */
async function firstCategoryOf(last: string) {
  for (const candidate of categorySlugCandidates(last)) {
    const category = await getCategoryBySlug(candidate);
    if (category) return category;
  }
  return null;
}

export default async function BrandCategoryPage({
  params,
}: {
  params: Promise<{ slug: string; path: string[] }>;
}) {
  const { slug, path } = await params;

  // The original Zoey URLs vary in depth (e.g.
  // /brands/<brand>/<cat>, /brands/<brand>/<parent>/<cat>). Use the deepest
  // segment as the category slug, and try the same spellings the catch-all does:
  // Zoey's numeric disambiguator stripped, and its doubled hyphens (an ampersand
  // became an empty word — `grates--drains`) collapsed. A miss here is QUIETER
  // than a 404 and so worth more care: the page falls back to the brand's whole
  // catalogue, so the reader gets a plausible-looking page of the wrong products.
  const last = path[path.length - 1] ?? "";

  const [brand, category, memberPricingEnabled, defaultListingSort] = await Promise.all([
    getBrandBySlug(slug),
    firstCategoryOf(last),
    getFeatureFlag("member_pricing_enabled"),
    // 2,691 legacy brand-range addresses land here, and the page they are
    // leaving lists price high-to-low. There is no sort control on this page,
    // so the storefront's own default is the whole answer (card InEoeMZh).
    getDefaultListingSort(),
  ]);

  if (!brand) {
    // A renamed brand address redirects rather than bare-404ing. (card EVvRDnZt)
    await redirectIfMapped(`/brands/${slug}/${path.join("/")}`);
    // A RANGE under a brand we no longer carry — 379 of these in the legacy sitemap
    // (card InEoeMZh). One hop to the brand index, not two: `/brands/<dead>` would
    // only send the reader on again. A range under a brand we DO carry never gets
    // here; it falls through below to the brand's own products.
    // Temporary (307), not permanent (308) — same reason as `brands/[slug]`: a
    // cached 308 to a generic index cannot be undone once the brand comes back.
    redirect("/brands");
  }

  // If we can't resolve the category, fall back to brand-only products. This
  // gives the URL a sensible landing instead of 404.
  const filter: {
    brandId: number;
    categoryId?: number;
    limit: number;
    sort: ListingSort;
  } = {
    brandId: brand.id as number,
    limit: 48,
    sort: defaultListingSort,
  };
  if (category) filter.categoryId = category.id;

  let { products, total } = await getProducts(filter);
  // A range this brand has nothing in lands the same way an UNRESOLVED range
  // does — on the brand's own products, not on an empty page. 2,691 legacy
  // addresses arrive here and the pairing is Zoey's, not ours: `3 Monkeez ×
  // Grates & Drains` is a real brand and a real shelf with no overlap. An empty
  // grid under a heading naming both reads as "this shop has stopped carrying
  // it", which is a different and wrong claim. (InEoeMZh.)
  let rangeIsEmpty = false;
  if (category && products.length === 0) {
    rangeIsEmpty = true;
    delete filter.categoryId;
    ({ products, total } = await getProducts(filter));
  }

  const heading =
    category && !rangeIsEmpty
      ? `${brand.name as string} — ${category.name as string}`
      : (brand.name as string);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <nav className="flex flex-wrap items-center gap-1.5 text-sm text-zinc-400 mb-6">
        <Link href="/brands" className="hover:text-zinc-600">Brands</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href={`/brands/${slug}`} className="hover:text-zinc-600">
          {brand.name as string}
        </Link>
        {category && !rangeIsEmpty && (
          <>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-zinc-700">{category.name as string}</span>
          </>
        )}
      </nav>

      <div className="mb-10 flex flex-col lg:flex-row gap-8 items-start bg-zinc-50 rounded-2xl overflow-hidden">
        {(brand.image_url as string | null) && (
          <div className="lg:w-2/5 flex-shrink-0 bg-white rounded-2xl m-3 p-6 relative min-h-[200px]">
            <Image
              src={brand.image_url as string}
              alt={brand.name as string}
              fill
              sizes="(max-width: 1024px) 100vw, 40vw"
              className="object-contain p-6"
            />
          </div>
        )}
        <div className={`flex-1 py-8 pr-8 text-left ${brand.image_url ? "" : "pl-8"}`}>
          <h1 className="text-3xl font-bold text-zinc-900">{heading}</h1>
          <p className="mt-3 text-sm text-zinc-500">
            {total} {total === 1 ? "product" : "products"}
          </p>
        </div>
      </div>

      {products.length > 0 ? (
        <ProductGrid products={products} memberPricingAvailable={memberPricingEnabled} memberPriceMap={await getListingMemberPrices(products)} listId={`brand_${brand.slug ?? brand.id}`} listName={String(brand.name ?? "")} />
      ) : (
        <p className="text-zinc-500 text-center py-12">
          {category
            ? `No ${brand.name as string} products in ${category.name as string}.`
            : `No products from ${brand.name as string} yet.`}
        </p>
      )}
    </div>
  );
}
