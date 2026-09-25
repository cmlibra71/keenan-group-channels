import { unstable_cache } from "next/cache";
import { CHANNEL_ID, getBrandsForChannel, getCategoryListing } from "@/lib/store";
import {
  brandColumnRequests,
  resolveBrandColumn,
  type MegaBrandLike,
  type MegaMenuNodeLike,
  type MegaNavItem,
} from "@/lib/mega-menu";

/**
 * The data behind the drop-downs' Brands columns (card HaWBvySC) — which brands
 * each column lists, keyed by department id, ready to render.
 *
 * The header calls this on every page, so it costs NOTHING unless somebody has
 * added a Brands column in Storefront > Navigation: no column, no query. When
 * there is one, both reads are cached for the same half hour as the rest of the
 * menu and busted by the same tags.
 *
 * An AUTOMATIC column reads the department's busiest brands from its own base
 * listing — the materialized `category_listing_cache` row the department page
 * already serves — so the menu names exactly the brands that page's Brand
 * filter offers, in the same order, and costs one primary-key read per
 * department at most.
 */

/** A department's busiest brands on this storefront, busiest first. */
const getDepartmentTopBrands = (categoryId: number) =>
  unstable_cache(
    async (): Promise<{ id: number; name: string }[]> => {
      const listing = (await getCategoryListing(categoryId)) as {
        facets?: { brands?: { id: number; name: string }[] };
      };
      return (listing.facets?.brands ?? []).map((b) => ({ id: Number(b.id), name: b.name }));
    },
    [`mega-menu-top-brands-${CHANNEL_ID}-${categoryId}`],
    { revalidate: 1800, tags: [`channel-${CHANNEL_ID}`, "brands", "categories"] }
  )();

export async function getMegaMenuBrandColumns(
  items: MegaNavItem[] | null | undefined,
  departments: MegaMenuNodeLike[]
): Promise<Record<number, MegaBrandLike[]>> {
  const requests = brandColumnRequests(items, departments);
  if (requests.length === 0) return {};

  const [channelBrands, tops] = await Promise.all([
    getBrandsForChannel().then((rows) =>
      (rows as { id: number; name: string; slug: string | null }[]).map((b) => ({
        id: Number(b.id),
        name: b.name,
        slug: b.slug ?? "",
      }))
    ),
    Promise.all(
      requests.map((r) =>
        r.brandIds.length > 0
          ? Promise.resolve(null)
          : getDepartmentTopBrands(r.categoryId).catch(() => [])
      )
    ),
  ]);

  const columns: Record<number, MegaBrandLike[]> = {};
  requests.forEach((r, i) => {
    columns[r.categoryId] = resolveBrandColumn({
      brandIds: r.brandIds,
      topBrands: tops[i],
      channelBrands,
    });
  });
  return columns;
}
