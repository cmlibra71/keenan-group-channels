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
 * `null` means no tag at all — nothing is inserted, nothing is rendered. That is the template's
 * value on purpose: a NEW site opts in by typing its own wording here, rather than inheriting
 * another business's promise the day it is forked.
 */
export const PROMO_TAG_LABEL: string | null = null;
