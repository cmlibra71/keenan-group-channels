import "server-only";

// ============================================================================
// Per-block template data providers (CMS v2.1) — Chef's Depot fork.
// Lists/facts the block seeds bind beyond their own props.* fields.
// ============================================================================

import type { RenderContext } from "@keenan/services";
import {
  getTopCategories,
  getMegaMenu,
  getBrandsForChannel,
  getJsonSetting,
} from "@/lib/store";
import imageLoader from "@/lib/image-loader";
import { lucideSvg } from "./lucide-svg";

function img(raw: string | null | undefined, w: number): string | null {
  return raw ? imageLoader({ src: raw, width: w, quality: 80 }) : null;
}
function srcset(raw: string | null | undefined, widths: number[]): string | null {
  return raw ? widths.map((w) => `${imageLoader({ src: raw, width: w, quality: 80 })} ${w}w`).join(", ") : null;
}

type Provider = (
  props: Record<string, unknown>,
  ctx?: RenderContext
) => Promise<Record<string, unknown>>;

const PROVIDERS: Record<string, Provider> = {
  // components/home/TrustBar.tsx — the hardcoded design trio
  trust_bar: async () => ({
    trustItems: [
      { iconSvg: lucideSvg("crown", "h-5 w-5 text-member", { strokeWidth: 1.7 }), label: "Members-Only Pricing" },
      { iconSvg: lucideSvg("truck", "h-5 w-5 text-member", { strokeWidth: 1.7 }), label: "Australia-Wide Delivery" },
      { iconSvg: lucideSvg("gift", "h-5 w-5 text-member", { strokeWidth: 1.7 }), label: "Partner Discounts" },
    ],
  }),

  // components/home/SeoFaq.tsx — homepage_seo setting with the design fallbacks
  seo_faq: async () => {
    const setting = await getJsonSetting("homepage_seo", {} as {
      heading?: string;
      body?: string;
      faqs?: { q: string; a: string }[];
    }).catch(() => ({}) as { heading?: string; body?: string; faqs?: { q: string; a: string }[] });
    return {
      seo: {
        heading: setting.heading || "Australia's trade supplier for commercial kitchens",
        body:
          setting.body ||
          "Chefs Depot supplies professional-grade commercial kitchen equipment and consumables to the hospitality trade — from refrigeration, cooking and food prep to warewashing, smallwares and furniture. Members access wholesale pricing across the full range, with Australia-wide delivery and priority fulfilment.",
        faqs:
          setting.faqs && setting.faqs.length > 0
            ? setting.faqs
            : [
                { q: "How does Chefs Depot membership pricing work?", a: "Member pricing is calculated from our current trade price list at the moment you see it — the same list our own team quotes from. Membership starts from $14.95/month, your member price applies from your first order, and it steps down further as your rolling twelve-month spend grows. The distance is set item by item, so there is no single percentage: your price is shown on every product page once you are signed in." },
                { q: "Do you deliver Australia-wide?", a: "Yes — we deliver commercial kitchen equipment and supplies right across Australia. Freight is calculated at checkout based on your delivery address and the items in your order." },
                { q: "Can I get a quote for a large or fit-out order?", a: "Absolutely. Add items to a quote and our team will prepare pricing you can take to approval or finance. Items without a listed price (made-to-order or freight-only) go to quote for confirmation." },
                { q: "Are prices shown with or without GST?", a: "Prices default to ex-GST for trade. Use the GST switch on any product page to flip every price between excluding and including GST — your choice is remembered." },
              ],
      },
    };
  },

  // home-blocks.tsx ShopByCategory
  shop_by_category: async () => {
    const [topCategories, megaMenu] = await Promise.all([getTopCategories(), getMegaMenu()]);
    return {
      categories: (topCategories as Array<{ id: number; name: string; slug: string; image_url?: string | null }>)
        .slice(0, 8)
        .map((c) => {
          const childCount =
            (megaMenu as { departments: Array<{ id: number; children: unknown[] }> }).departments.find(
              (d) => d.id === c.id
            )?.children.length ?? 0;
          return {
            name: c.name,
            slug: c.slug,
            image: img(c.image_url, 400),
            imageSrcset: srcset(c.image_url, [200, 400, 600]),
            childCountLabel:
              childCount > 0 ? `${childCount} categor${childCount === 1 ? "y" : "ies"}` : "",
          };
        }),
    };
  },

  // home-blocks.tsx BrandShowcaseBlock
  brand_showcase: async () => {
    const allBrands = (await getBrandsForChannel()) as Array<{
      id: number; name: string; slug: string; image_url?: string | null;
    }>;
    const featured = [
      ...allBrands.filter((b) => b.image_url),
      ...allBrands.filter((b) => !b.image_url),
    ].slice(0, 9);
    return {
      brands: featured.map((b) => ({ name: b.name, slug: b.slug, image: img(b.image_url, 200) })),
    };
  },
};

/** Extra template data for a block type (empty when no provider). */
export async function blockData(
  type: string,
  props: Record<string, unknown>,
  ctx?: RenderContext
): Promise<Record<string, unknown>> {
  const provider = PROVIDERS[type];
  return provider ? provider(props, ctx) : {};
}
