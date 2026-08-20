import { RichContent } from "@/components/content/RichContent";

export interface CategorySeoFaq {
  question: string;
  answer_html: string;
  answer_text: string;
}

/**
 * The SEO block at the FOOT of a category page — two paragraphs and a question accordion
 * (card xvz6pXB4, Steve 2026-08-20).
 *
 * Industry Kitchens prints ONLY its own approved content (`category_channel_seo`, overlaid
 * as `channel_seo_intro_html` / `channel_seo_faq`), and renders NOTHING when there is
 * none — no heading, no empty accordion, no placeholder.
 *
 * STYLING is this site's own vocabulary, not Chefs Depot's: IK's category page is a plain
 * `max-w-7xl` container on a white ground with the zinc scale, so the block matches that
 * rather than borrowing CD's serif headings and steel tones. No `prose` classes: the
 * typography plugin is not installed on either site, so they compile to nothing and the
 * paragraph gaps come from the `mb-4` the generated HTML carries.
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
 * The JSON-LD lives here rather than in `generateMetadata` because it must mirror exactly
 * what is on the page: same component, same data, one decision. It is built in services
 * from the plain-text answers, so it can never disagree with the visible words.
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
      className="border-t border-zinc-200"
      {...(items.length > 0
        ? { "aria-labelledby": "category-seo-heading" }
        : { "aria-label": `About ${categoryName}` })}
    >
      {/* THE BLOCK OWNS ITS OWN CONTAINER, exactly as the Chefs Depot one does. The node
          branch returns an authored tree and the block is appended AFTER it, outside any
          page container, so a block relying on a parent's gutter runs edge to edge —
          measured on a local Industry Kitchens build: 0 to 1440px on a 1440px viewport. */}
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      {introHtml && (
        <RichContent
          html={introHtml}
          stripStyles
          className="max-w-[80ch] text-[15px] leading-relaxed text-zinc-700 [&_a]:font-medium [&_a]:text-zinc-900 [&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-zinc-300 hover:[&_a]:text-zinc-700"
        />
      )}

      {items.length > 0 && (
        <div className={introHtml ? "mt-10" : ""}>
          <h2
            id="category-seo-heading"
            className="mb-5 text-2xl font-semibold text-zinc-900"
          >
            {categoryName} — Common Questions
          </h2>
          <div className="divide-y divide-zinc-200 border-y border-zinc-200">
            {items.map((item, index) => (
              <details key={`${index}-${item.question}`} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-semibold text-zinc-900">
                  {item.question}
                  <span className="text-zinc-500 transition-transform duration-200 group-open:rotate-45">
                    +
                  </span>
                </summary>
                <RichContent
                  html={item.answer_html}
                  stripStyles
                  className="mt-2.5 max-w-[80ch] text-sm leading-relaxed text-zinc-600 [&_a]:font-medium [&_a]:text-zinc-900 [&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-zinc-300 hover:[&_a]:text-zinc-700"
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
          // Built in @keenan/services from the plain-text answers, with < > & written as
          // \uXXXX escapes so nothing in it can close this element.
          dangerouslySetInnerHTML={{ __html: faqJsonLd }}
        />
      )}
    </section>
  );
}
