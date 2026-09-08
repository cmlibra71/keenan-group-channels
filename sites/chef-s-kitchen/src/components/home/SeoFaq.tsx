import Link from "next/link";
import { DEFAULT_SEO_FAQS } from "./seo-faq-defaults";

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
    "Chefs Depot supplies professional-grade commercial kitchen equipment and consumables to the hospitality trade — from refrigeration, cooking and food prep to warewashing, smallwares and furniture. Members access wholesale pricing across the full range, with Australia-wide delivery and priority fulfilment.";
  const items: Faq[] = faqs && faqs.length > 0 ? faqs : DEFAULT_SEO_FAQS;

  return (
    <section className="section-bordered">
      <div className="container-page section-padding">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <p className="eyebrow mb-3">Why Chefs Depot</p>
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
