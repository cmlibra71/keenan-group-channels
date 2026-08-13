/**
 * Storefront filter rail configuration — the shopper-facing half of the portal's
 * Products > Filtering screen (card NfYe3P3G).
 *
 * The rail has exactly three facets: Sub-category, Brand and Price. Each one can
 * be switched off, reordered, renamed and set to start open or collapsed, per
 * CHANNEL, from the portal. "In stock" and Clearance stay retired as facets and
 * are not configurable (Clearance browses via /clearance).
 *
 * Read from commerce `channel_settings.storefront_filters` as
 * `{ filters: StorefrontFilter[] }`; the portal writes the identical shape from
 * its own copy of this module (`src/lib/storefront-filters.ts` in
 * keenan-group-portal). Keep the two in step — the shape is the contract.
 *
 * PURE module: no DB, no server-only imports, so the client rail can import the
 * types. The cached read lives in `@/lib/store` (`getStorefrontFilters`).
 */

export const STOREFRONT_FILTERS_SETTING_KEY = "storefront_filters";

/** Facet ids are the rail's URL params, so config and query key off one token. */
export const STOREFRONT_FILTER_IDS = ["sub", "brand", "price"] as const;
export type StorefrontFilterId = (typeof STOREFRONT_FILTER_IDS)[number];

export interface StorefrontFilter {
  id: StorefrontFilterId;
  /** Heading shown above the facet (renameable in the portal). */
  label: string;
  /** Off = not rendered, and its URL selections are ignored. */
  enabled: boolean;
  /** True = the section starts collapsed. */
  collapsed: boolean;
  /** Position in the rail, top first. */
  sortOrder: number;
}

/** What the rail did before it was configurable — also the fallback. */
export const DEFAULT_STOREFRONT_FILTERS: StorefrontFilter[] = [
  { id: "sub", label: "Sub-category", enabled: true, collapsed: false, sortOrder: 0 },
  { id: "brand", label: "Brand", enabled: true, collapsed: false, sortOrder: 1 },
  { id: "price", label: "Price (ex GST)", enabled: true, collapsed: false, sortOrder: 2 },
];

const MAX_LABEL = 40;

function isFilterId(v: unknown): v is StorefrontFilterId {
  return typeof v === "string" && (STOREFRONT_FILTER_IDS as readonly string[]).includes(v);
}

/**
 * Coerce whatever is stored into the full three-filter config, in rail order.
 *
 * Anything missing or unparseable falls back to that filter's default, and
 * unknown ids (the retired mock filters, or a facet a newer portal knows about
 * and this build does not) are dropped rather than trusted.
 */
export function normalizeStorefrontFilters(raw: unknown): StorefrontFilter[] {
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { filters?: unknown } | null)?.filters)
      ? (raw as { filters: unknown[] }).filters
      : [];

  const saved = new Map<StorefrontFilterId, Partial<StorefrontFilter>>();
  list.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    const row = entry as Record<string, unknown>;
    if (!isFilterId(row.id) || saved.has(row.id)) return;
    const label = typeof row.label === "string" ? row.label.trim().slice(0, MAX_LABEL) : "";
    const order = Number(row.sortOrder);
    saved.set(row.id, {
      label: label || undefined,
      enabled: typeof row.enabled === "boolean" ? row.enabled : undefined,
      collapsed: typeof row.collapsed === "boolean" ? row.collapsed : undefined,
      sortOrder: Number.isFinite(order) ? order : index,
    });
  });

  const merged = DEFAULT_STOREFRONT_FILTERS.map((def, defaultIndex) => {
    const row = saved.get(def.id);
    return {
      filter: {
        id: def.id,
        label: row?.label ?? def.label,
        enabled: row?.enabled ?? def.enabled,
        collapsed: row?.collapsed ?? def.collapsed,
        sortOrder: row?.sortOrder ?? def.sortOrder,
      } satisfies StorefrontFilter,
      // A configured filter outranks one that was never saved, so a partial
      // config keeps the operator's order and appends the rest.
      rank: row ? 0 : 1,
      defaultIndex,
    };
  });

  merged.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.filter.sortOrder - b.filter.sortOrder ||
      a.defaultIndex - b.defaultIndex
  );
  return merged.map((m, i) => ({ ...m.filter, sortOrder: i }));
}

/** Ids the shopper may filter on — everything else is off. */
export function enabledFilterIds(filters: StorefrontFilter[]): Set<StorefrontFilterId> {
  return new Set(filters.filter((f) => f.enabled).map((f) => f.id));
}

/** The rail's facet payload, plus the config the route resolved for it. */
export interface StorefrontFacets {
  subcategories: { id: number; name: string; slug: string; count: number }[];
  brands: { id: number; name: string; count: number }[];
  price: { key: string; count: number }[];
  availability: { key: string; count: number }[];
  /** Set by applyStorefrontFilters; absent means "use the defaults". */
  filters?: StorefrontFilter[];
}

/**
 * Apply the channel's rail config to a listing's facets: a switched-off facet's
 * options are removed outright, so EVERY renderer (the sealed rail, the CMS
 * blocks and the authored Site Builder tree, which all read the same payload)
 * stops offering it — not just the one that reads `filters` for labels, order
 * and open/collapsed.
 *
 * The route must ALSO ignore that facet's URL selections; a disabled facet whose
 * `?brand=` still filtered would silently narrow the listing with nothing on
 * screen to explain or clear it.
 */
export function applyStorefrontFilters<T extends StorefrontFacets>(
  facets: T,
  filters: StorefrontFilter[]
): T {
  const on = enabledFilterIds(filters);
  return {
    ...facets,
    subcategories: on.has("sub") ? facets.subcategories : [],
    brands: on.has("brand") ? facets.brands : [],
    price: on.has("price") ? facets.price : [],
    filters,
  };
}
