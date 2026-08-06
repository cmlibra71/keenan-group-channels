import {
  getHomepageSections,
  getHomepageCategoryTiles,
  getValueBarItems,
  getCustomerLogos,
  getHomepageCopy,
  getFeatureFlag,
  getProducts,
  getCategoryBySlug,
} from "@/lib/store";
import { applyAccountPrices, getListingMemberPrices } from "@/lib/member";
import { applyCatalogScope } from "@/lib/catalog-scope";
import type { HomeNativeData } from "./home-natives";
import type { HomeSectionsInput } from "@keenan/services/builder";

// ============================================================================
// SERVER data assembly for Industry Kitchens' node homepage.
//
// A line-for-line mirror of what app/page.tsx fetches, because the sealed
// `home-section` native renders the SAME components the live page does — give
// it different data and the two diverge no matter how faithful the markup is.
//
// IK's homepage is an ordered list of configured sections rather than Chefs
// Depot's fixed slots, so the bindable half travels through `sectionList` (see
// HomeSectionsInput) while the native half travels in HomeNativeData.
// ============================================================================

export interface HomePathNeeds {
  hero?: boolean;
  cats?: boolean;
  brands?: boolean;
  featured?: boolean;
  clearance?: boolean;
  faq?: boolean;
  membership?: boolean;
  prize?: boolean;
  stats?: boolean;
  plan?: boolean;
  /** home.sectionList[*] — IK's ordered sections. */
  sectionList?: boolean;
}

type Row = Record<string, unknown>;
type CarouselProducts = Awaited<ReturnType<typeof getProducts>>["products"];

export async function loadHomeNativeData(
  keys: Set<string>,
  pathNeeds: HomePathNeeds = {}
): Promise<{ home: HomeNativeData; sections: HomeSectionsInput }> {
  // Any authored home tree needs the sections: they are both the native's data
  // and the bindable list. The key scan is kept so a tree that places sections
  // by key pulls them too.
  const needed = keys.size > 0 || !!pathNeeds.sectionList || !!pathNeeds.cats;
  if (!needed) return { home: {}, sections: {} };

  const [sections, categoryTiles, valueBarItems, customerLogos, copy, memberPricingEnabled] =
    await Promise.all([
      getHomepageSections().catch(() => []),
      getHomepageCategoryTiles().catch(() => []),
      getValueBarItems().catch(() => []),
      getCustomerLogos().catch(() => ({}) as { heading?: string; logos?: unknown[] }),
      getHomepageCopy().catch(() => ({}) as Row),
      getFeatureFlag("member_pricing_enabled").catch(() => false),
    ]);

  // Products for every product_carousel section — same queries, same limits,
  // same de-duplication by category_slug as the live route.
  const carousels: Record<string, { products: CarouselProducts }> = {};
  await Promise.all(
    sections
      .filter((s) => s.type === "product_carousel")
      .map(async (s) => {
        if (s.type !== "product_carousel") return;
        if (carousels[s.category_slug]) return;
        if (s.variant === "clearance") {
          const { products } = await getProducts({ onSale: true, limit: 9 });
          carousels[s.category_slug] = { products };
          return;
        }
        const category = await getCategoryBySlug(s.category_slug);
        const { products } = category
          ? await getProducts({ categoryId: category.id, limit: 8 })
          : { products: [] as CarouselProducts };
        carousels[s.category_slug] = { products };
      })
  );

  // ProductGrid does the catalog-scope and account-price passes at READ time on
  // the live page. The native renders client-side and cannot, so both passes
  // move up here — exactly the shape the brand and category branches use.
  const scopedCarousels: Record<string, { products: CarouselProducts }> = {};
  let memberPriceMap: Record<number, number> = {};
  for (const [slug, entry] of Object.entries(carousels)) {
    const scoped = await applyAccountPrices(await applyCatalogScope(entry.products));
    scopedCarousels[slug] = { products: scoped };
    if (scoped.length) {
      memberPriceMap = { ...memberPriceMap, ...(await getListingMemberPrices(scoped)) };
    }
  }

  return {
    home: {
      sections,
      categoryTiles,
      categoryTilesHeading: (copy as Row).categories_heading as string | undefined,
      valueBarItems,
      customerLogos: customerLogos as { heading?: string; logos?: unknown[] },
      carousels: scopedCarousels,
      memberPriceMap,
      memberPricingAvailable: !!memberPricingEnabled,
    },
    // The bindable list the EXPLODED section masters read.
    //
    // Three section types carry no inline content — category_tiles, value_bar
    // and customer_logos each live in their own settings key, and
    // HomeSections.tsx passes them in separately. An authored master binds
    // `home.sectionList[N].tiles`, so they have to be resolved INTO the list or
    // the master sees undefined, renders nothing, and the page silently loses a
    // section. That cost a 1,647px regression before the flag caught it.
    sections: {
      sectionList: sections.map((sec) => {
        const base = { ...(sec as unknown as Row) };
        switch (sec.type) {
          case "category_tiles":
            return { ...base, tiles: categoryTiles, heading: (copy as Row).categories_heading ?? "" };
          case "value_bar":
            return { ...base, items: valueBarItems };
          case "customer_logos": {
            const cl = customerLogos as { heading?: string; logos?: unknown[] };
            return { ...base, logos: cl.logos ?? [], heading: cl.heading ?? "" };
          }
          // The rail's products, already catalog-scoped and account-priced
          // above. composeHomePagePayload runs them through the SAME card
          // enrichment the fixed featured/clearance slots get, so the section
          // masters bind href/image/price halves without deriving anything.
          //
          // `max_save_pct` is the one thing a tree cannot work out for itself:
          // ClearanceSpotlight reduces over the whole list for its "save up to
          // N%" line, and there is no reduce in a binding expression.
          case "product_carousel": {
            const products = (scopedCarousels[sec.category_slug]?.products ?? []) as Row[];
            const pct = (p: Row) => {
              const price = parseFloat(String(p.price ?? ""));
              const sale = p.salePrice != null ? parseFloat(String(p.salePrice)) : NaN;
              if (!Number.isFinite(sale) || !Number.isFinite(price) || sale <= 0 || sale >= price) return 0;
              return Math.round(((price - sale) / price) * 100);
            };
            return {
              ...base,
              products,
              max_save_pct: products.reduce((max, p) => Math.max(max, pct(p)), 0),
            };
          }
          default:
            return base;
        }
      }) as Row[],
    },
  };
}
