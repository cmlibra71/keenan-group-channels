import { RichContent } from "@/components/content/RichContent";

/**
 * The brand page's copy block — this storefront's own approved wording when it
 * has one, else the scraped `metafields.intro_html`.
 *
 * `prose prose-zinc` used to sit here and generated NOTHING: no storefront
 * installs @tailwindcss/typography, so every authored sub-heading rendered at
 * body weight and the paragraphs ran together — the exact defect Steve reported
 * on category pages (nYxPgpvK) and again on brand pages (leNXsdgf). The rules
 * that do the work are `.kg-page-copy` in globals.css, which is also the class
 * the Site Builder's "Brand page copy" palette entry carries, so the block reads
 * the same whether the page is drawn from an authored tree or from here.
 *
 * Colour stays on this component (`text-zinc-700`); the shared rules set none, so
 * one set of them serves a light card and a dark hero alike.
 */
export function BrandIntro({ html }: { html?: string | null }) {
  if (!html) return null;
  return (
    <section className="mb-10">
      <RichContent
        html={html}
        stripStyles
        className="kg-page-copy max-w-none text-zinc-700 leading-relaxed"
      />
    </section>
  );
}
