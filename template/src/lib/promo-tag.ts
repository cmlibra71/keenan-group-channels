/**
 * The storefront's promotional tile tag — the PER-SITE half of card FNYihLHk.
 *
 * Steve's card asks for a "Buy more + Save more" tag on every product tile, "like Mates Rates on
 * IK". That is a CHEFS DEPOT promise: it is the shopper-facing face of the Chefs Depot
 * buying-group ladder (cards Nyp8bkPm / gk23c1VK). Another storefront has its own trade wording
 * and its own pricing model, so it must not inherit this by accident.
 *
 * The tag is drawn by SHARED code — the listing tile the Site Builder repeats is transformed at
 * render time in `builder/promo-tag-node.ts`, which is byte-identical across `template/` and both
 * sites. So the per-channel decision has to live somewhere a site is allowed to differ, and this
 * is that seam: the same shape as `lib/orders/pay-balance-site.tsx`, deliberately NOT listed in
 * `orchestrator/shared-modules.json`.
 *
 * `null` means no tag at all — nothing is inserted, nothing is rendered. That is the template's
 * value on purpose: a NEW site opts in by typing its own wording here, rather than inheriting
 * another business's promise the day it is forked.
 *
 * TYPING A WORDING HERE IS THE WHOLE OPT-IN. The three things it needs are already in place and
 * inert: `components/product/ProductCard.tsx` renders the pill when this is non-null,
 * `@/lib/store` places the same wording on the authored `product-card` master so every authored
 * page carries it too, and `.badge-promo` is declared in `app/globals.css` (a neutral grey pill;
 * redefine that class to give it the site's own colour). Nothing else to wire.
 */
export const PROMO_TAG_LABEL: string | null = null;
