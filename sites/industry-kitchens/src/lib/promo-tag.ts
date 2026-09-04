/**
 * The storefront's promotional tile tag — the PER-SITE half of card FNYihLHk.
 *
 * Steve's card asks for a "Buy more + Save more" tag on every product tile, "like Mates Rates on
 * IK". That is a CHEFS DEPOT promise: it is the shopper-facing face of the Chefs Depot
 * buying-group ladder (cards Nyp8bkPm / gk23c1VK). Industry Kitchens has its own trade wording
 * and is not on that ladder, so it must not inherit this by accident.
 *
 * The tag is drawn by SHARED code — the listing tile the Site Builder repeats is transformed at
 * render time in `builder/promo-tag-node.ts`, which is byte-identical across `template/` and both
 * sites. So the per-channel decision has to live somewhere a site is allowed to differ, and this
 * is that seam: the same shape as `lib/orders/pay-balance-site.tsx`, deliberately NOT listed in
 * `orchestrator/shared-modules.json`.
 *
 * `null` means no tag at all — nothing is inserted, nothing is rendered. Industry Kitchens is
 * deliberately null: the card's own comparison is IK's existing "Mates Rates" tag, a DIFFERENT
 * promise on a different pricing model. Setting a wording here would put the Chefs Depot
 * buying-group message on a live Industry Kitchens tile.
 *
 * If this site ever does name a tag, typing it here is the whole opt-in — nothing else to wire.
 * `components/product/ProductCard.tsx` renders the pill when this is non-null, `@/lib/store`
 * places the same wording on the authored `product-card` master so every authored page carries it
 * too, and `.badge-promo` is declared in `app/globals.css` (a neutral grey pill; redefine that
 * class to give it this site's own colour). All three are inert while this stays null.
 */
export const PROMO_TAG_LABEL: string | null = null;
