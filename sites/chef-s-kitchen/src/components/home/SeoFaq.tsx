import Link from "next/link";

type Faq = { q: string; a: string };

/**
 * Design-system homepage SEO copy + FAQ block. Content is editable via the
 * `homepage_seo` channel setting ({ heading, body, faqs:[{q,a}] }); falls back
 * to on-brand trade copy so the block always renders (design parity).
 */
export function SeoFaq({
  heading,
  body,
  faqs,
}: {
  heading?: string | null;
  body?: string | null;
  faqs?: Faq[] | null;
}) {
  const h = heading || "Australia's trade supplier for commercial kitchens";
  const b =
    body ||
    "Chef's Depot supplies professional-grade commercial kitchen equipment and consumables to the hospitality trade — from refrigeration, cooking and food prep to warewashing, smallwares and furniture. Members access wholesale pricing across the full range, with Australia-wide delivery and priority fulfilment.";
  const items: Faq[] =
    faqs && faqs.length > 0
      ? faqs
      : [
          {
            q: "How does Chef's Depot membership pricing work?",
            a: "Members pay wholesale, cost-plus pricing across the catalogue — typically 10–25% below retail. Join from $14.95/month and your member price is applied automatically at cart and checkout.",
          },
          {
            q: "Do you deliver Australia-wide?",
            a: "Yes — we deliver commercial kitchen equipment and supplies right across Australia. Freight is calculated at checkout based on your delivery address and the items in your order.",
          },
          {
            q: "Can I get a quote for a large or fit-out order?",
            a: "Absolutely. Add items to a quote and our team will prepare pricing you can take to approval or finance. Items without a listed price (made-to-order or freight-only) go to quote for confirmation.",
          },
          {
            q: "Are prices shown with or without GST?",
            a: "Prices default to ex-GST for trade. Use the GST switch in the header to flip every price between excluding and including GST — your choice is remembered.",
          },
        ];

  return (
    <section className="section-bordered">
      <div className="container-page section-padding">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <p className="eyebrow mb-3">Why Chef&apos;s Depot</p>
            <h2 className="section-title">{h}</h2>
            <p className="mt-5 max-w-prose text-[15px] leading-relaxed text-text-secondary">{b}</p>
            <Link href="/membership" className="btn-primary mt-7">
              Become a member
            </Link>
          </div>

          <div>
            <h3 className="heading-serif mb-5 text-2xl text-text-primary">Frequently asked questions</h3>
            <div className="divide-y divide-border border-y border-border">
              {items.map((f) => (
                <details key={f.q} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-semibold text-text-primary">
                    {f.q}
                    <span className="text-accent transition-transform duration-200 group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-2.5 text-sm leading-relaxed text-text-secondary">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
