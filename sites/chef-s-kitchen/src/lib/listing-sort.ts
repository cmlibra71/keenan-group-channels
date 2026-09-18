/**
 * The DEFAULT order products come back in on a landing page, per storefront
 * (card InEoeMZh).
 *
 * Why this exists. The legacy Industry Kitchens site lists every brand and
 * category landing page **price high to low** — verified on the live legacy
 * site 2026-09-18: `/brands/rational` and `/commercial-combi-ovens` both open on
 * "Price: High to Low". Our listings open on Relevance. Tim's card asks whether
 * the landing pages "respond in the same way" after the switch, and Steve's
 * answer named "ordering of products by price" as one of the things that has to
 * be true before he is confident — "for all categories, across the site".
 *
 * It is a per-CHANNEL setting rather than a code constant for two reasons. The
 * two storefronts are separate businesses (Tim, card k6pHXQBf): Chefs Depot is
 * LIVE on Relevance and nobody has asked for that to move. And the register's
 * standing rule on `sf-catalog-browse` — listing order is sub-category
 * sort_order, then `category_relevance`, then name, then id — stays the
 * behaviour of a channel that has never configured anything, so an unset
 * storefront is untouched by this file existing.
 *
 * Stored in commerce `channel_settings.default_listing_sort` as a bare string;
 * the portal writes the identical shape from its own copy of this module
 * (`src/lib/listing-sort.ts` in keenan-group-portal). Keep the two in step —
 * the shape is the contract, exactly as it is for `storefront-filters.ts`.
 *
 * PURE module: no DB, no server-only imports, so the client sort control can
 * import the type. The cached read lives in `@/lib/store`
 * (`getDefaultListingSort`).
 */

export const DEFAULT_LISTING_SORT_SETTING_KEY = "default_listing_sort";

/** Every order a listing route accepts on `?sort=`. Same tokens the services
 *  layer takes, so the URL, the setting and the SQL all say one word. */
export const LISTING_SORTS = [
  "relevance",
  "price_asc",
  "price_desc",
  "saving",
  "newest",
] as const;

export type ListingSort = (typeof LISTING_SORTS)[number];

/** What a storefront that has never configured anything does — the order the
 *  listings shipped with, and the one the behaviour register records. */
export const FALLBACK_LISTING_SORT: ListingSort = "relevance";

/** The shopper-facing wording. One place, so the portal's preview and the
 *  storefront's dropdown cannot name the same order differently. */
export const LISTING_SORT_LABELS: Record<ListingSort, string> = {
  relevance: "Relevance",
  price_asc: "Price: low → high",
  price_desc: "Price: high → low",
  saving: "Biggest saving",
  newest: "Newest",
};

export function isListingSort(value: unknown): value is ListingSort {
  return typeof value === "string" && (LISTING_SORTS as readonly string[]).includes(value);
}

/**
 * Coerce whatever is stored in `channel_settings` into a usable order.
 *
 * Anything absent, empty or unrecognised — including an order a NEWER portal
 * knows about and this build does not — falls back to the shipped order rather
 * than being trusted, for the same reason `normalizeStorefrontFilters` drops
 * unknown facet ids. `{ sort: "…" }` is accepted as well as a bare string so a
 * future object-shaped setting cannot silently read as "never configured".
 */
export function normalizeDefaultListingSort(raw: unknown): ListingSort {
  if (isListingSort(raw)) return raw;
  const nested = (raw as { sort?: unknown } | null)?.sort;
  if (isListingSort(nested)) return nested;
  return FALLBACK_LISTING_SORT;
}

/**
 * The order a listing request actually runs in.
 *
 * `?sort=` wins when it names a real order — INCLUDING `?sort=relevance`, which
 * is how a shopper on a price-ordered storefront gets back to Relevance. A
 * missing or unrecognised param takes the storefront's own default. Reading
 * `relevance` as "no param" would make the dropdown's first option unreachable
 * on exactly the storefronts this setting exists for.
 */
export function parseListingSort(
  raw: string | undefined,
  fallback: ListingSort = FALLBACK_LISTING_SORT
): ListingSort {
  return isListingSort(raw) ? raw : normalizeDefaultListingSort(fallback);
}

/**
 * How a sort control writes its choice back to the URL.
 *
 * The storefront's OWN default is the one that writes no parameter, not the
 * literal `relevance`: on a storefront defaulting to price high-to-low, dropping
 * the param for `relevance` would send the shopper straight back to price
 * high-to-low and the control would read as broken.
 */
export function sortParamFor(
  value: string,
  defaultSort: ListingSort = FALLBACK_LISTING_SORT
): string | null {
  const next = parseListingSort(value, defaultSort);
  return next === normalizeDefaultListingSort(defaultSort) ? null : next;
}
