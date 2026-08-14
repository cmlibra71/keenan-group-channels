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
 *
 * STYLING — two traps, both verified in a browser rather than reasoned about:
 *
 * 1. `text-steel-700`, not steel-600. This site's `@theme` block defines steel-700/500/400/
 *    300/200/100/50 and NO steel-600, and Tailwind v4 emits a colour utility only for a
 *    token that exists, so `text-steel-600` compiles to nothing at all.
 * 2. No `content-prose` wrapper. `.content-prose` is declared unlayered in globals.css and
 *    therefore beats Tailwind's utility layer on the same element: with it, BOTH the colour
 *    and the `mb-4` paragraph gaps this component depends on were silently overridden
 *    (measured: colour rgb(47,36,41), margin 14.4px, i.e. the prose rule, not ours). The
 *    generated HTML is only escaped `<p>` / `<p class="mb-4">` paragraphs — `brandIntroHtml`
 *    can emit nothing else — so prose styling for links, lists and headings buys nothing
 *    here, and dropping it makes the site read the way the category copy block does.
 */
export function BrandIntro({ html }: { html?: string | null }) {
  if (!html) return null;
  return (
    <section className="mb-10">
      <RichContent
        html={html}
        stripStyles
        className="max-w-[80ch] text-[15px] leading-relaxed text-steel-700"
      />
    </section>
  );
}
