/**
 * Per-category attribute filters — the storefront half (card C8G4f4U8).
 *
 * The engine that DECIDES which attributes a category offers lives in
 * `@keenan/services` (`services/catalog/attributeFacets.ts`); this module is the
 * shopper-facing contract around it: the URL params, the slider's "a thumb at
 * the end means no limit" rule, and the labels. It is PURE — no DB, no
 * server-only imports — because the rail is a client component, and a client
 * module may not pull in the services barrel.
 *
 * URL shape:
 *   `?f_width=600-900`   a range window, either side open (`600-`, `-900`)
 *   `?f_doors=1-door,2-door`  ticked option slugs
 *   `?price=1000-3000`   the Price facet's slider, which also still accepts the
 *                        three legacy band tokens (lt1000 / 1000to3000 / gt3000)
 */

export interface AttributeFacetOption {
  value: string;
  label: string;
  count: number;
}

/** One attribute section as the listing hands it over. */
export interface AttributeFacet {
  code: string;
  label: string;
  kind: "range" | "options";
  unit?: string;
  /** Range only — the slider's travel. */
  min?: number;
  max?: number;
  options?: AttributeFacetOption[];
}

export interface RangeWindow {
  min?: number;
  max?: number;
}

/** The rail's URL param for an attribute — namespaced so it can never collide
 *  with `sub` / `brand` / `price` / `sort` / `page`. */
export function attributeParam(code: string): string {
  return `f_${code}`;
}

/** URL/DB-stable token for a text value. Must match the services `attrSlug`. */
export function attrSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Read `600-900` / `600-` / `-900`; anything else is ignored rather than
 *  half-applied, so a mangled bookmark cannot silently narrow a listing. */
export function parseRangeParam(raw: string | undefined | null): RangeWindow | undefined {
  if (!raw) return undefined;
  const match = raw.match(/^\s*([0-9]*(?:\.[0-9]+)?)\s*-\s*([0-9]*(?:\.[0-9]+)?)\s*$/);
  if (!match) return undefined;
  const min = match[1] === "" ? undefined : Number(match[1]);
  const max = match[2] === "" ? undefined : Number(match[2]);
  if (min === undefined && max === undefined) return undefined;
  if ((min !== undefined && !Number.isFinite(min)) || (max !== undefined && !Number.isFinite(max)))
    return undefined;
  if (min !== undefined && max !== undefined && min > max) return undefined;
  return { min, max };
}

export function formatRangeParam(range: RangeWindow): string {
  return `${range.min ?? ""}-${range.max ?? ""}`;
}

/**
 * Turn the two thumb positions into the param to write — or `null` when the
 * shopper has left BOTH at the ends, which means "no limit either way" and must
 * clear the filter rather than pin the listing to the slider's travel. The
 * travel is the 1st–99th percentile, so a max pinned at the end would otherwise
 * drop the most expensive 1% of the shelf without saying so.
 */
export function rangeParamFor(
  facet: { min?: number; max?: number },
  window: RangeWindow
): string | null {
  const atMin = window.min === undefined || (facet.min !== undefined && window.min <= facet.min);
  const atMax = window.max === undefined || (facet.max !== undefined && window.max >= facet.max);
  if (atMin && atMax) return null;
  return formatRangeParam({ min: atMin ? undefined : window.min, max: atMax ? undefined : window.max });
}

/**
 * The slider's TRAVEL, widened where it has to be to CONTAIN the window that is
 * actually applied — plus the step grid the two range inputs move on.
 *
 * The travel handed in is the 1st–99th percentile of the values left after the
 * OTHER filters, so an applied window can fall wholly outside it: on Chefs
 * Depot, `?f_doors=2-door&price=lt1000` left a $1,600–$14,750 travel with an
 * "under $1,000" window, and both thumbs clamped to the travel minimum — the
 * slider read "$1,600 – $1,600" beneath a chip saying "Under $1,000". A control
 * positively misrepresenting the state is the thing the price-band rule exists
 * to stop, so the travel moves to fit the window instead.
 *
 * An OPEN side of the window is drawn by parking that thumb ON the travel end
 * (which writes no bound at all), so that end must lie OUTSIDE the window: a
 * window with no floor pushes the travel down to zero rather than up to the
 * window's own ceiling.
 *
 * The top is rounded UP to the step grid because a range input can only stop on
 * steps measured from `min`: a top off the grid is unreachable, the thumb parks
 * one step short, and the dearest products are quietly dropped.
 */
export function sliderTravel(
  range: { min: number; max: number },
  applied?: RangeWindow
): { min: number; max: number; step: number } {
  let low = range.min;
  let high = range.max;
  if (applied) {
    if (applied.min !== undefined) {
      low = Math.min(low, applied.min);
      high = Math.max(high, applied.min);
    }
    if (applied.max !== undefined) {
      low = Math.min(low, applied.max);
      high = Math.max(high, applied.max);
    }
    if (applied.min === undefined && applied.max !== undefined && applied.max <= low)
      low = Math.min(0, range.min);
    if (applied.max === undefined && applied.min !== undefined && applied.min >= high)
      high = applied.min + Math.max(range.max - range.min, 1);
  }
  const span = high - low;
  const step = span > 2000 ? 50 : span > 200 ? 10 : span > 20 ? 1 : 0.1;
  return { min: low, max: low + Math.ceil(span / step) * step, step };
}

/** Human form of a window, for a chip: "600–900mm", "up to 900mm". */
export function formatRangeLabel(range: RangeWindow, unit?: string): string {
  const suffix = unit ?? "";
  const plain = (n: number) => Number(n.toFixed(2)).toLocaleString("en-AU");
  const num = (n: number) => `${plain(n)}${suffix}`;
  // The unit is printed once, on the end of the pair: "600–900mm".
  if (range.min !== undefined && range.max !== undefined) return `${plain(range.min)}–${num(range.max)}`;
  if (range.min !== undefined) return `${num(range.min)} and up`;
  if (range.max !== undefined) return `up to ${num(range.max)}`;
  return "";
}

/** The three retired-but-honoured price band tokens. */
export const PRICE_BANDS = ["lt1000", "1000to3000", "gt3000"] as const;
export type PriceBand = (typeof PRICE_BANDS)[number];

export function parsePriceBands(raw: string | undefined | null): PriceBand[] {
  return (raw?.split(",").filter(Boolean) ?? []).filter((b): b is PriceBand =>
    (PRICE_BANDS as readonly string[]).includes(b)
  );
}

/** The window a legacy band token covers, so a bookmarked `?price=lt1000` can
 *  still be SHOWN on the slider it replaced. Several bands union into the widest
 *  window they span; an unrecognised token yields nothing. */
export function priceBandWindow(bands: PriceBand[]): RangeWindow | undefined {
  const spans: Record<PriceBand, RangeWindow> = {
    lt1000: { max: 1000 },
    "1000to3000": { min: 1000, max: 3000 },
    gt3000: { min: 3000 },
  };
  if (bands.length === 0) return undefined;
  let min: number | undefined = Infinity;
  let max: number | undefined = -Infinity;
  for (const band of bands) {
    const span = spans[band];
    min = span.min === undefined || min === undefined ? undefined : Math.min(min, span.min);
    max = span.max === undefined || max === undefined ? undefined : Math.max(max, span.max);
  }
  if (min === undefined && max === undefined) return undefined;
  return { min: min === Infinity ? undefined : min, max: max === -Infinity ? undefined : max };
}

/** Money for a price chip / slider label — whole dollars, ex GST like the facet. */
export function formatPriceLabel(range: RangeWindow): string {
  const money = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`;
  if (range.min !== undefined && range.max !== undefined) return `${money(range.min)}–${money(range.max)}`;
  if (range.min !== undefined) return `${money(range.min)} and up`;
  if (range.max !== undefined) return `up to ${money(range.max)}`;
  return "";
}

/** Every attribute selection in a category page's search params. */
export function parseAttributeSelections(
  facets: AttributeFacet[],
  get: (param: string) => string | undefined
): Record<string, string[] | RangeWindow> {
  const out: Record<string, string[] | RangeWindow> = {};
  for (const facet of facets) {
    const raw = get(attributeParam(facet.code));
    if (!raw) continue;
    if (facet.kind === "range") {
      const window = parseRangeParam(raw);
      if (window) out[facet.code] = window;
    } else {
      const values = [...new Set(raw.split(",").map(attrSlug).filter(Boolean))];
      if (values.length) out[facet.code] = values;
    }
  }
  return out;
}
