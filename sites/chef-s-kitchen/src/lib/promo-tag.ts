/**
 * The Chefs Depot "Buy more & save" tile tag — the PER-SITE half of card FNYihLHk.
 *
 * Steve's card is two Rodd & Gunn screenshots: a solid coloured pill sitting under the brand,
 * name and price on a product tile. The card's DESCRIPTION spells the tagline "Buy more + Save
 * more"; the MOCK renders it "Buy more & save". The mock is the rendered copy — it is what Steve
 * looked at and approved — so it wins on screen, and this constant is the single place that copy
 * lives. The test beside this file locks it: an editor "correcting" it back to the description's
 * wording would silently change customer-visible copy on every Chefs Depot listing tile.
 *
 * This is the TAG only. It states no threshold, no percentage and no dollar figure, because the
 * spend-more-save-more MODEL behind it belongs to cards Nyp8bkPm and gk23c1VK — a number invented
 * here would be wrong money on a customer-facing screen.
 *
 * WHY THE WORDING LIVES HERE rather than in the tile. The listing tile is drawn two ways on this
 * site: the React `components/product/ProductCard.tsx` (home rails, /products, /clearance,
 * /search, brand pages) and, on every AUTHORED page — category, brand, the product page's "You
 * may also like" rail, `/pages/[slug]` — the `product-card` component the Site Builder repeats,
 * which shared code has to reach at render time (`builder/promo-tag-node.ts`, applied once at
 * `@/lib/store` so no branch can load the master without it). That shared module is
 * byte-identical across `template/` and both sites, so the per-channel decision has to sit in a
 * file a site is allowed to differ in. This is that seam — the same shape as
 * `lib/orders/pay-balance-site.tsx`, deliberately NOT listed in
 * `orchestrator/shared-modules.json`. `template/` and Industry Kitchens hold `null` here, which
 * inserts and renders nothing: IK has its own trade tag ("Mates Rates", the card's own
 * comparison) and is not on the Chefs Depot buying-group ladder.
 */
export const PROMO_TAG_LABEL: string | null = "Buy more & save";
