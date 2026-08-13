import { RichContent } from "@/components/content/RichContent";

/**
 * The content block at the top of a brand page — the text a shopper reads above the
 * products (card xvz6pXB4, Steve 2026-08-13).
 *
 * Chefs Depot prints ONLY its own approved wording (`brand_channel_seo.intro_text`,
 * overlaid as `channel_intro_html`). It deliberately does not fall back to the shared
 * `brands.metafields.intro_html` bag the Industry Kitchens page uses: that copy was
 * scraped from the old Industry Kitchens site and written for it, so serving it here
 * would put the other business's words on a Chefs Depot page — and two identical brand
 * pages competing for the same search is the exact failure this card exists to prevent.
 *
 * Renders nothing at all when there is no text, so a brand page without wording looks
 * exactly as it does today.
 */
export function BrandIntro({ html }: { html?: string | null }) {
  if (!html) return null;
  return (
    <section className="mb-10">
      <RichContent
        html={html}
        stripStyles
        className="content-prose max-w-[80ch] text-[15px] leading-relaxed text-steel-600"
      />
    </section>
  );
}
