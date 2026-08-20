import { RichContent } from "@/components/content/RichContent";

export interface CategorySeoFaq {
  question: string;
  answer_html: string;
  answer_text: string;
}

/**
 * The SEO block at the FOOT of a category page — two paragraphs and a question accordion
 * (card xvz6pXB4, Steve 2026-08-20: "we want that bottom of page SEO content for each
 * category to be dynamic for each page, formatted as to match the rest of the site look
 * and feel").
 *
 * Chefs Depot prints ONLY its own approved content (`category_channel_seo`, overlaid as
 * `channel_seo_intro_html` / `channel_seo_faq`). A category with nothing published renders
 * NOTHING — no heading, no empty accordion, no placeholder — so a page without content
 * looks exactly as it does today.
 *
 * STYLING: this is the site's own vocabulary, not the scoped `.cd-category-seo` block
 * Steve wrote for his demo. `section-bordered`, `container-page`, `section-padding`,
 * `heading-serif`, `divide-border` and the `text-text-*` tokens are the same ones the home
 * page's FAQ uses, so the block reads as part of the site rather than as something pasted
 * into it, and it follows the site's design system when that changes.
 *
 * TWO TRAPS, both learned on the brand block and both still live here:
 *   1. A colour utility only exists if the TOKEN exists — this site's `@theme` has
 *      steel-700 and no steel-600, and Tailwind v4 emits nothing for a token it does not
 *      have. Every class here is one the compiled stylesheet already carries.
 *   2. No `.content-prose` wrapper: it is declared unlayered in globals.css, so it beats
 *      the utility layer on the same element and quietly takes over both the colour and
 *      the paragraph gaps.
 *
 * LINK STYLING IS ON THE COMPONENT, NOT IN THE DATA. The generated HTML carries internal
 * links (Steve's prompt requires them), and on this site a bare `<a>` inside body copy
 * inherits the paragraph exactly — measured in a browser: the seven subcategory links in
 * the first paragraph were indistinguishable from the words around them, which is useless
 * to a shopper and halves what the link is there for. The arbitrary variants below
 * (`[&_a]:...`) style the descendants from the COMPONENT's own source, so Tailwind compiles
 * them for certain — unlike a class written into stored HTML, which may only ever be one
 * the deployed stylesheet already carries.
 *
 * The JSON-LD is emitted here rather than in `generateMetadata` because it must mirror
 * exactly what is on the page: same component, same data, one decision. It is built in
 * services from the plain-text answers, so it can never disagree with the visible words,
 * and it is absent whenever the FAQ is.
 */
export function CategorySeo({
  introHtml,
  faq,
  faqJsonLd,
  categoryName,
}: {
  introHtml?: string | null;
  faq?: CategorySeoFaq[] | null;
  faqJsonLd?: string | null;
  categoryName: string;
}) {
  const items = faq ?? [];
  if (!introHtml && items.length === 0) return null;

  return (
    <section
      className="section-bordered"
      {...(items.length > 0
        ? { "aria-labelledby": "category-seo-heading" }
        : { "aria-label": `About ${categoryName}` })}
    >
      <div className="container-page section-padding">
        {introHtml && (
          <RichContent
            html={introHtml}
            stripStyles
            className="max-w-[80ch] text-[15px] leading-relaxed text-steel-700 [&_a]:font-medium [&_a]:text-text-primary [&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-border hover:[&_a]:text-accent"
          />
        )}

        {items.length > 0 && (
          <div className={introHtml ? "mt-10" : ""}>
            <h2
              id="category-seo-heading"
              className="heading-serif mb-5 text-2xl text-text-primary"
            >
              {categoryName} — Common Questions
            </h2>
            <div className="divide-y divide-border border-y border-border">
              {items.map((item, index) => (
                <details key={`${index}-${item.question}`} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-semibold text-text-primary">
                    {item.question}
                    <span className="text-accent transition-transform duration-200 group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <RichContent
                    html={item.answer_html}
                    stripStyles
                    className="mt-2.5 max-w-[80ch] text-sm leading-relaxed text-text-secondary [&_a]:font-medium [&_a]:text-text-primary [&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-border hover:[&_a]:text-accent"
                  />
                </details>
              ))}
            </div>
          </div>
        )}
      </div>

      {faqJsonLd && (
        <script
          type="application/ld+json"
          // Built in @keenan/services from the plain-text answers: no HTML, no author
          // markup, and JSON.stringify escaping is what produced this string.
          dangerouslySetInnerHTML={{ __html: faqJsonLd }}
        />
      )}
    </section>
  );
}
