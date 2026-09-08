import { getProducts, getFeatureFlag, getMegaMenu, getMegaMenuNav, getMegaMenuHidden, productService, CHANNEL_ID, type MegaMenuNode } from "@/lib/store";
import { flattenTree } from "@/lib/mega-menu";
import { ikNavItems } from "@/lib/ik-nav";
import { getListingMemberPrices } from "@/lib/member";
import { ProductGrid } from "@/components/product/ProductGrid";
import { getCatalogScope } from "@/lib/catalog-scope";
import { CategoryTiles, type CategoryTile } from "@/components/category/CategoryTiles";
import Link from "next/link";

function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("...");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push("...");
  pages.push(total);
  return pages;
}

const filters = [
  { key: "all", label: "All Products", href: "/products" },
  { key: "featured", label: "Featured", href: "/products?filter=featured" },
  { key: "sale", label: "On Sale", href: "/products?filter=sale" },
] as const;

type FilterKey = (typeof filters)[number]["key"];

export const metadata = {
  title: "Products",
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; filter?: string }>;
}) {
  const params = await searchParams;
  const page = parseInt(params.page || "1", 10);
  const activeFilter: FilterKey = filters.some((f) => f.key === params.filter)
    ? (params.filter as FilterKey)
    : "all";

  const fetchOptions: Parameters<typeof getProducts>[0] = { page, limit: 24 };
  if (activeFilter === "featured") fetchOptions.featured = true;
  if (activeFilter === "sale") fetchOptions.onSale = true;

  // CATEGORY ACCESS (group ∩ contact) — resolved through the ONE chokepoint (lib/catalog-scope),
  // not a bespoke group-only lookup. Applied at QUERY level here so `total`/pagination stay exact:
  // null → the cached channel path; [] ('none') → nothing; ids → an uncached, category-bounded
  // query (results are per-viewer and must never enter the shared cache).
  // PRODUCT-level restrictions (per-account exclusivity) are applied downstream in <ProductGrid>,
  // which every card on this page funnels through.
  const { categories: accessibleCategoryIds } = await getCatalogScope();

  const productsPromise =
    accessibleCategoryIds === null
      ? getProducts(fetchOptions)
      : accessibleCategoryIds.length === 0
        ? Promise.resolve({ products: [], total: 0 })
        : productService.listForChannel(CHANNEL_ID, {
            page,
            limit: 24,
            categoryIds: accessibleCategoryIds,
            featured: fetchOptions.featured,
            onSale: fetchOptions.onSale,
          });

  const [{ products, total }, memberPricingEnabled, megaMenu, megaNav, hiddenDepartments] =
    await Promise.all([
      productsPromise,
      getFeatureFlag("member_pricing_enabled"),
      getMegaMenu().catch(() => ({ departments: [] as MegaMenuNode[] })),
      getMegaMenuNav().catch(() => []),
      getMegaMenuHidden().catch(() => []),
    ]);
  const totalPages = Math.ceil(total / 24);

  // The strip IS the department bar's own list. Industry Kitchens now composes
  // its bar through the same shared, unit-tested `resolveNavItems` with the same
  // two inputs — the Navigation editor's items (order + extras) and the
  // per-department off switch `mega_menu_hidden_categories` — so the two rows on
  // this screen cannot disagree about what the departments are or what they are
  // called. A department switched off the MENU is off here too; it keeps its
  // page and stays reachable from /categories, the homepage blocks and search.
  // (Card mOTgYEvX, replacing the IK_NAV_DEPARTMENT_COUNT = 7 constant LrRNJiEY
  // left here while the IK bar was parked.)
  const byId = flattenTree(megaMenu.departments);
  const barDepartments: CategoryTile[] = ikNavItems({
    departments: megaMenu.departments,
    items: megaNav,
    hiddenCategoryIds: hiddenDepartments,
  }).flatMap((item) => {
    if (item.type !== "category" || item.categoryId == null) return [];
    const node = byId.get(item.categoryId);
    if (!node) return [];
    // The same wording the bar prints: Industry Kitchens shows the editor's own
    // label in both places (it does not shorten the way Chefs Depot does).
    return [{ id: node.id, name: item.label || node.name, slug: node.slug, image_url: node.image_url }];
  });

  // Departments are a way IN to the tree, so a department the viewer may not
  // open must not be offered: `assertCategoryVisible` 404s a category outside a
  // restricted contact's allow-list, and the list is matched exactly (no
  // subtree expansion — see @keenan/services catalogScope.ts). null = no
  // category restriction, which is every shopper today.
  const departments =
    accessibleCategoryIds === null
      ? barDepartments
      : barDepartments.filter((d) => accessibleCategoryIds.includes(d.id));
  const memberPriceMap = await getListingMemberPrices(products);

  const filterParam = activeFilter !== "all" ? `&filter=${activeFilter}` : "";
  const pageTitle = filters.find((f) => f.key === activeFilter)?.label || "All Products";

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-zinc-900 mb-6">{pageTitle}</h1>

      {/* Shop by category — the way into the tree from this flat listing */}
      <CategoryTiles categories={departments} />

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-8">
        {filters.map((f) => (
          <Link
            key={f.key}
            href={f.href}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeFilter === f.key
                ? "bg-zinc-900 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {products.length === 0 ? (
        <p className="text-zinc-500 text-center py-16">No products found.</p>
      ) : (
        <ProductGrid products={products} memberPricingAvailable={memberPricingEnabled} memberPriceMap={memberPriceMap} listId="all_products" listName="All Products" />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-12 flex items-center justify-center gap-2">
          {page > 1 && (
            <a href={`/products?page=${page - 1}${filterParam}`} className="px-3 py-2 rounded-lg text-sm font-medium bg-zinc-100 text-zinc-600 hover:bg-zinc-200">
              Previous
            </a>
          )}

          {getPageNumbers(page, totalPages).map((p, i) =>
            p === "..." ? (
              <span key={`ellipsis-${i}`} className="px-2 py-2 text-sm text-zinc-400">...</span>
            ) : (
              <a
                key={p}
                href={`/products?page=${p}${filterParam}`}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  p === page
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                {p}
              </a>
            )
          )}

          {page < totalPages && (
            <a href={`/products?page=${page + 1}${filterParam}`} className="px-3 py-2 rounded-lg text-sm font-medium bg-zinc-100 text-zinc-600 hover:bg-zinc-200">
              Next
            </a>
          )}
        </div>
      )}
    </div>
  );
}
