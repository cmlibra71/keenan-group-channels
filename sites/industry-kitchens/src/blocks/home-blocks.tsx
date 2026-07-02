// ============================================================================
// Homepage section blocks — Industry Kitchens fork.
//
// Every adapter renders through HomeSections with a single synthesized section,
// so a CMS-driven homepage is BYTE-IDENTICAL to the legacy homepage_sections
// settings model (same switch, same components). Sections that read channel
// settings (category tiles, value bar, customer logos) fetch the same cached
// accessors the legacy route fetched.
// ============================================================================
import type { RenderContext } from "@keenan/services";
import {
  getProducts,
  getCategoryBySlug,
  getFeatureFlag,
  getHomepageCopy,
  getValueBarItems,
  getHomepageCategoryTiles,
  getCustomerLogos,
  type HomeSection,
  type HomeImage,
} from "@/lib/store";
import { HomeSections, type HomeSectionsProps } from "@/components/home/HomeSections";

type BlockProps = { props: Record<string, unknown>; ctx?: RenderContext };

const EMPTY: Omit<HomeSectionsProps, "sections"> = {
  categoryTiles: [],
  valueBarItems: [],
  customerLogos: {},
  carousels: {},
  memberPricingAvailable: false,
};

/** Render one synthesized section through the legacy renderer. */
function single(
  section: HomeSection,
  data: Partial<Omit<HomeSectionsProps, "sections">> = {}
) {
  return <HomeSections sections={[section]} {...EMPTY} {...data} />;
}

// ── Settings-backed sections ─────────────────────────────────────────────────

async function CategoryTileGridBlock(_: BlockProps) {
  const [tiles, copy] = await Promise.all([getHomepageCategoryTiles(), getHomepageCopy()]);
  return single({ type: "category_tiles" }, { categoryTiles: tiles, categoryTilesHeading: copy.categories_heading });
}

async function ValueBarBlock({ props }: BlockProps) {
  // IK's ValueBarItem shape comes from the value_bar_items setting; block-level
  // overrides pass through as-is (ValueBar tolerates missing extras).
  const items =
    Array.isArray(props.items) && props.items.length > 0
      ? (props.items as Awaited<ReturnType<typeof getValueBarItems>>)
      : await getValueBarItems();
  return single({ type: "value_bar" }, { valueBarItems: items });
}

async function CustomerLogosBlock({ props }: BlockProps) {
  const fromProps = Array.isArray(props.logos) && props.logos.length > 0;
  const customerLogos = fromProps
    ? { heading: props.heading as string | undefined, logos: props.logos as never }
    : await getCustomerLogos();
  return single({ type: "customer_logos" }, { customerLogos });
}

// ── Props-only sections (straight pass-through) ─────────────────────────────

const passthrough = (type: string) =>
  function PassthroughSection({ props }: BlockProps) {
    return single({ type, ...props } as HomeSection);
  };

const ImageBannerBlock = passthrough("image_banner");
const BannerCarouselBlock = passthrough("banner_carousel");
const LogoStripBlock = passthrough("logo_strip");
const PromoTilesBlock = passthrough("promo_tiles");
const SplitPromosBlock = passthrough("split_promos");
const CategoryButtonsBlock = passthrough("category_buttons");
const TestimonialsBlock = passthrough("testimonials");
const TaglineBlock = passthrough("tagline");
// section type "rich_text" ≠ registry rich_text(html) — CMS name is text_cta
const TextCtaBlock = passthrough("rich_text");

// ── Product carousel (live data) ─────────────────────────────────────────────

async function ProductCarouselBlock({ props }: BlockProps) {
  const categorySlug = typeof props.category_slug === "string" ? props.category_slug : "";
  const variant = props.variant === "clearance" ? "clearance" : "default";

  let products: Awaited<ReturnType<typeof getProducts>>["products"] = [];
  try {
    if (variant === "clearance") {
      ({ products } = await getProducts({ onSale: true, limit: 9 }));
    } else if (categorySlug) {
      const category = await getCategoryBySlug(categorySlug);
      if (category) ({ products } = await getProducts({ categoryId: category.id, limit: 8 }));
    }
  } catch {
    products = [];
  }
  if (products.length === 0) return null;
  const memberPricingAvailable = await getFeatureFlag("member_pricing_enabled");

  // hero.* is stored flattened (portal field round-trip safety) — reassemble.
  const hero: HomeImage | undefined = props.hero_image_url
    ? {
        image_url: props.hero_image_url as string,
        href: (props.hero_href as string) || undefined,
        alt: (props.hero_alt as string) || undefined,
        width: (props.hero_width as number) || undefined,
        height: (props.hero_height as number) || undefined,
      }
    : (props.hero as HomeImage | undefined);

  const section: HomeSection = {
    type: "product_carousel",
    heading: (props.heading as string) ?? "",
    subheading: props.subheading as string | undefined,
    cta_text: props.cta_text as string | undefined,
    cta_href: props.cta_href as string | undefined,
    category_slug: categorySlug,
    variant,
    hero,
  };
  return single(section, {
    carousels: { [categorySlug]: { products } },
    memberPricingAvailable,
  });
}

export const HOME_BLOCK_COMPONENTS = {
  category_tile_grid: CategoryTileGridBlock,
  value_bar: ValueBarBlock,
  customer_logos: CustomerLogosBlock,
  image_banner: ImageBannerBlock,
  banner_carousel: BannerCarouselBlock,
  logo_strip: LogoStripBlock,
  promo_tiles: PromoTilesBlock,
  split_promos: SplitPromosBlock,
  category_buttons: CategoryButtonsBlock,
  text_cta: TextCtaBlock,
  testimonials: TestimonialsBlock,
  tagline: TaglineBlock,
  product_carousel: ProductCarouselBlock,
};
