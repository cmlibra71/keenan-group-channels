import { draftMode, headers } from "next/headers";
import { renderHomeNodeBranch } from "@/builder/home-node-branch";
import {
  getProducts,
  getCategoryBySlug,
  getFeatureFlag,
  getHomepageCopy,
  getValueBarItems,
  getHomepageCategoryTiles,
  getHomepageSections,
  getCustomerLogos,
  getCmsPage,
} from "@/lib/store";
import { attachBrandLogos } from "@/lib/brand-logo-fallback";
import { HomeSections } from "@/components/home/HomeSections";
import { BlockRenderer, type RenderedBlock } from "@/blocks/BlockRenderer";

type CarouselProducts = Awaited<ReturnType<typeof getProducts>>["products"];

export default async function HomePage() {
  // ═══ Site Builder node path — additive. Returns null (and we fall through to
  // the CMS/legacy paths below) until a home tree is authored and published.
  // `/json` sets x-kg-json, which forces the draft tree so a conversion can be
  // diffed against this page before anything is published. ═══
  const node = await renderHomeNodeBranch();
  if (node) return node.element;

  // ═══ CMS home path (kill switch: flag off → legacy homepage_sections) ═══
  // The block document was migrated 1:1 from homepage_sections; adapters render
  // through HomeSections, so both paths produce identical markup.
  if (await getFeatureFlag("cms_pages_enabled")) {
    const { isEnabled } = await draftMode();
    const draft = isEnabled || (await headers()).get("x-kg-json") === "1";
    const cmsHome = await getCmsPage("home", draft).catch(() => null);
    if (cmsHome && cmsHome.blocks.length > 0) {
      return (
        <div className="bg-white">
          <BlockRenderer blocks={cmsHome.blocks as unknown as RenderedBlock[]} draft={draft} />
        </div>
      );
    }
  }

  const [sections, categoryTiles, valueBarItems, customerLogos, copy, memberPricingEnabled] =
    await Promise.all([
      getHomepageSections(),
      getHomepageCategoryTiles(),
      getValueBarItems(),
      getCustomerLogos(),
      getHomepageCopy(),
      getFeatureFlag("member_pricing_enabled"),
    ]);

  // Resolve products for every product_carousel section.
  const carousels: Record<string, { products: CarouselProducts }> = {};
  await Promise.all(
    sections
      .filter((s) => s.type === "product_carousel")
      .map(async (s) => {
        if (s.type !== "product_carousel") return;
        if (carousels[s.category_slug]) return;
        if (s.variant === "clearance") {
          const { products } = await getProducts({ onSale: true, limit: 9 });
          // Card tSrCcnvx: the clearance rail draws its OWN tile
          // (ClearanceSpotlight), not <ProductGrid>, so the brand-logo fallback
          // has to be attached here — the grid resolves it for itself and this
          // rail cannot, being a client component. Every other carousel variant
          // renders through HomepageSpotlight → ProductGrid and is already
          // covered. No-op on any channel outside BRAND_LOGO_FALLBACK_CHANNELS.
          carousels[s.category_slug] = {
            products: (await attachBrandLogos(products)) as unknown as CarouselProducts,
          };
          return;
        }
        const category = await getCategoryBySlug(s.category_slug);
        const { products } = category
          ? await getProducts({ categoryId: category.id, limit: 8 })
          : { products: [] as CarouselProducts };
        carousels[s.category_slug] = { products };
      })
  );

  return (
    <div className="bg-white">
      <HomeSections
        sections={sections}
        categoryTiles={categoryTiles}
        categoryTilesHeading={copy.categories_heading}
        valueBarItems={valueBarItems}
        customerLogos={customerLogos}
        carousels={carousels}
        memberPricingAvailable={memberPricingEnabled}
      />
    </div>
  );
}
