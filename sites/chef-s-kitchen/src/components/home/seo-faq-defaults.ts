/**
 * The homepage FAQ answers, in ONE place (card gk23c1VK).
 *
 * They were in four: `SeoFaq.tsx`, `blocks/block-data.ts`, the authored home
 * tree in the database, and `DEFAULT_HOME_FAQS` inside `@keenan/services`
 * (`builder/page-payloads.ts`), which fills in when the channel has no
 * `homepage_seo` setting — which Chefs Depot does not. That last one is why
 * fixing the React source retired nothing a customer could see: the live page
 * kept rendering "Members pay wholesale, cost-plus pricing across the catalogue
 * — typically 10–25% below retail" out of the shared package, in the answer
 * Google reads as FAQ structured data.
 *
 * TWO RULES BIND THIS COPY, both from the same card:
 *   1. NO PRODUCT-SAVING PERCENTAGE. The spread differs item by item, so the
 *      catalogue cannot produce one, and a published claim has to survive an
 *      Australian Consumer Law challenge on substantiation.
 *   2. NO LADDER CLAIM. Levels, thresholds, monthly reviews and "calculated from
 *      our trade price list" describe an engine that ships switched OFF
 *      (`channel_settings.cd_member_ladder` is unwritten on both live channels).
 *      Copy and engine turn on together, in one setting.
 *
 * `home-data.ts` passes these explicitly rather than letting the null reach the
 * package's default, so the site's own words win on the site's own homepage.
 */
export const DEFAULT_SEO_FAQS: Array<{ q: string; a: string }> = [
  {
    q: "How does Chefs Depot membership pricing work?",
    a: "Member pricing is applied to your account automatically — every line reprices the moment your membership is active, with no code and no minimum order. Membership starts from $14.95/month. The difference is set item by item, so there is no single percentage: your price is shown on every product page.",
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
    a: "Prices default to ex-GST for trade. Use the GST switch on any product page to flip every price between excluding and including GST — your choice is remembered.",
  },
];
