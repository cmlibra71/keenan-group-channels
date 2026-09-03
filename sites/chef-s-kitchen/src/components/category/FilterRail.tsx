"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, X, SlidersHorizontal } from "lucide-react";
import {
  normalizeStorefrontFilters,
  type StorefrontFilter,
  type StorefrontFilterId,
} from "@/lib/storefront-filters";
import {
  attributeParam,
  formatPriceLabel,
  formatRangeLabel,
  parsePriceBands,
  parseRangeParam,
  priceBandWindow,
  rangeParamFor,
  sliderTravel,
  type AttributeFacet,
} from "@/lib/category-attributes";

// ── Generic facet model ───────────────────────────────────────────────────
// A group is one accordion section (Brand, Category, Price …). `value` is the
// opaque token written to the URL (?param=v1,v2); `label` is what the user sees.
export interface FacetOption {
  value: string;
  label: string;
  count: number;
}
export interface FacetGroupDef {
  param: string;
  title: string;
  options: FacetOption[];
  /** Accordion state on first paint (portal: Products > Filtering). */
  defaultOpen?: boolean;
  /** Present = this group is a min-max SLIDER, not a tick list (C8G4f4U8).
   *  `min`/`max` are the slider's travel; `money` prints the labels as dollars. */
  range?: { min: number; max: number; unit?: string; money?: boolean };
}

export interface CategoryFacets {
  subcategories: { id: number; name: string; slug: string; count: number }[];
  brands: { id: number; name: string; count: number }[];
  price: { key: string; count: number }[];
  availability: { key: string; count: number }[];
  /** Slider travel for the Price facet; absent on a payload computed before
   *  C8G4f4U8 (the materialized listing row is refreshed within minutes), in
   *  which case Price falls back to the three bands it always had. */
  priceRange?: { min: number; max: number } | null;
  /** The per-category attribute sections this category earned. */
  attributes?: AttributeFacet[];
  /** Per-channel rail config attached by the route (applyStorefrontFilters);
   *  absent on a call site that never resolved it — then the defaults apply. */
  filters?: StorefrontFilter[];
}

const PRICE_LABELS: Record<string, string> = {
  lt1000: "Under $1,000",
  "1000to3000": "$1,000–$3,000",
  gt3000: "$3,000+",
};
// Stock availability is NOT a shopper-facing facet: "In stock" was retired first
// and Clearance followed, so the rail has no Availability section at all.
// `CategoryFacets.availability` is still supplied by getCategoryListing (the
// materialized listing cache keeps the counts) — it is simply never rendered.
// Clearance products are browsed via the dedicated /clearance page.

/**
 * Map the category page's CategoryFacets into the generic group list, in the
 * order / under the headings / with the open state this channel configured in
 * the portal (Products > Filtering). A switched-off facet arrives with no
 * options (the route pruned it) and is dropped here as well, so it cannot come
 * back through a call site that forgot to pass the config.
 */
function categoryGroups(facets: CategoryFacets): FacetGroupDef[] {
  const config = normalizeStorefrontFilters(facets.filters);
  const optionsFor = (id: StorefrontFilterId): FacetOption[] => {
    if (id === "sub")
      return facets.subcategories.map((f) => ({ value: String(f.id), label: f.name, count: f.count }));
    if (id === "brand")
      return facets.brands.map((f) => ({ value: String(f.id), label: f.name, count: f.count }));
    return facets.price.map((f) => ({ value: f.key, label: PRICE_LABELS[f.key] ?? f.key, count: f.count }));
  };

  const groups: FacetGroupDef[] = [];
  for (const filter of config) {
    if (!filter.enabled) continue;
    // Price is a min-max slider now (C8G4f4U8 — Steve: "we just want sliders"),
    // and keeps the three bands as its fallback for a listing payload that
    // predates the change.
    if (filter.id === "price" && facets.priceRange) {
      groups.push({
        param: "price",
        title: filter.label,
        // The slider replaced the three tick boxes, but the band tokens are still
        // honoured server-side, so the band LABELS stay on the group: a shared or
        // bookmarked ?price=lt1000 still narrows the grid and must still be named
        // and removable on screen (NfYe3P3G).
        options: optionsFor("price"),
        defaultOpen: !filter.collapsed,
        range: { ...facets.priceRange, money: true },
      });
      continue;
    }
    const options = optionsFor(filter.id);
    // Price kept its section even when empty before this change; RailContent
    // drops any group whose options are all zero-count anyway, so the rail looks
    // the same and the empty case is now decided in one place.
    if (options.length === 0) continue;
    groups.push({
      param: filter.id,
      title: filter.label,
      options,
      defaultOpen: !filter.collapsed,
    });
  }

  // Per-category attribute sections sit UNDER the three configurable facets.
  // Which ones appear is decided by the data, not by a setting: the site reads
  // the values this category's products carry (services/catalog/attributeFacets).
  groups.push(...attributeGroups(facets));
  return groups;
}

/**
 * The per-category attribute sections on their own (C8G4f4U8).
 *
 * Split out of `categoryGroups` because an AUTHORED rail needs exactly these and
 * none of the three configurable facets: both storefronts now draw their
 * category rail from a Site Builder tree that binds Sub-category / Brand /
 * Price by hand, and `AttributeFacetSections` below places these underneath it
 * (`builder/category-facet-injection.ts`).
 */
function attributeGroups(facets: CategoryFacets): FacetGroupDef[] {
  const groups: FacetGroupDef[] = [];
  for (const attr of facets.attributes ?? []) {
    if (attr.kind === "range") {
      if (attr.min === undefined || attr.max === undefined) continue;
      groups.push({
        param: attributeParam(attr.code),
        title: attr.label,
        options: [],
        defaultOpen: true,
        range: { min: attr.min, max: attr.max, unit: attr.unit },
      });
    } else {
      const options = (attr.options ?? []).map((o) => ({
        value: o.value,
        label: o.label,
        count: o.count,
      }));
      if (options.length === 0) continue;
      groups.push({ param: attributeParam(attr.code), title: attr.label, options, defaultOpen: true });
    }
  }
  return groups;
}

/** Params the rail's "Clear all" / chips act on — the enabled facets, plus every
 *  attribute section this category offers. */
function clearParamsFor(facets: CategoryFacets): string[] {
  return [
    ...normalizeStorefrontFilters(facets.filters)
      .filter((f) => f.enabled)
      .map((f) => f.id),
    ...(facets.attributes ?? []).map((a) => attributeParam(a.code)),
  ];
}

/**
 * Generic design-system faceted filter rail: sticky 248px sidebar ≥1024px,
 * off-canvas drawer below. Selections update the URL query (one comma-joined
 * param per group) so filtered states are shareable and SSR-rendered; active
 * facets show as removable teal chips above the grid (FacetChips). Shared by the
 * category page (via the FilterRail adapter) and the search page.
 */
export function FacetRail({ groups, clearParams }: { groups: FacetGroupDef[]; clearParams: string[] }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      {/* Mobile trigger — wrapper carries the responsive hide so it isn't
          overridden by .btn-secondary's own `display` (same specificity). */}
      <div className="lg:hidden">
        <button
          onClick={() => setDrawerOpen(true)}
          className="btn-secondary btn-sm"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
        </button>
      </div>

      {/* Desktop rail */}
      <aside className="sticky top-[140px] hidden w-[248px] shrink-0 self-start lg:block">
        <RailContent groups={groups} clearParams={clearParams} />
      </aside>

      {/* Off-canvas drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[200] lg:hidden">
          <div className="absolute inset-0 bg-ink-900/50" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[300px] max-w-[85vw] overflow-y-auto bg-white p-5 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-bold uppercase tracking-[0.1em] text-text-primary">Filters</span>
              <button onClick={() => setDrawerOpen(false)} aria-label="Close filters" className="text-text-secondary">
                <X className="h-5 w-5" />
              </button>
            </div>
            <RailContent groups={groups} clearParams={clearParams} />
          </div>
        </div>
      )}
    </>
  );
}


/** Mobile-only facets (trigger + off-canvas drawer) — the Site Builder's
 *  authored DESKTOP rail pairs with this sealed mobile unit. */
export function MobileFilterRail({ facets }: { facets: CategoryFacets }) {
  const groups = categoryGroups(facets);
  const clearParams = clearParamsFor(facets);
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <>
      <div className="lg:hidden">
        <button onClick={() => setDrawerOpen(true)} className="btn-secondary btn-sm">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
        </button>
      </div>
      {drawerOpen && (
        <div className="fixed inset-0 z-[200] lg:hidden">
          <div className="absolute inset-0 bg-ink-900/50" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[300px] max-w-[85vw] overflow-y-auto bg-white p-5 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-bold uppercase tracking-[0.1em] text-text-primary">Filters</span>
              <button onClick={() => setDrawerOpen(false)} aria-label="Close filters" className="text-text-secondary">
                <X className="h-5 w-5" />
              </button>
            </div>
            <RailContent groups={groups} clearParams={clearParams} />
          </div>
        </div>
      )}
    </>
  );
}

/** "Clear all" for the authored rail header (renders nothing when inactive). */
export function ClearFiltersButton() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Every rail param, including whichever attribute sections this category
  // offers — they are decided from the data, so they cannot be listed here.
  const clearParams = [
    "sub",
    "brand",
    "price",
    ...[...searchParams.keys()].filter((k) => k.startsWith("f_")),
  ];
  const hasAny = clearParams.some((p) => searchParams.get(p));
  if (!hasAny) return null;
  return (
    <button
      onClick={() => {
        const next = new URLSearchParams(searchParams.toString());
        [...clearParams, "page"].forEach((p) => next.delete(p));
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      }}
      className="text-xs font-semibold text-accent hover:text-accent-hover"
    >
      Clear all
    </button>
  );
}

/** Category-page adapter — keeps the existing `<FilterRail facets={…} />` call site. */
export function FilterRail({ facets }: { facets: CategoryFacets }) {
  return <FacetRail groups={categoryGroups(facets)} clearParams={clearParamsFor(facets)} />;
}

function useFacetParam(param: string) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const selected = (searchParams.get(param)?.split(",").filter(Boolean) ?? []) as string[];

  const toggle = (value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    const set = new Set(selected);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    if (set.size > 0) next.set(param, [...set].join(","));
    else next.delete(param);
    next.delete("page"); // filters reset pagination
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  return { selected, toggle };
}

function RailContent({ groups, clearParams }: { groups: FacetGroupDef[]; clearParams: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // "Clear all" acts on every attribute param actually ON THE URL, not only the
  // ones this category's facets happen to name. An attribute the other filters
  // left with no values has no facet to be listed from, and a Clear all that
  // leaves the filter on is a visibly-enabled button that does nothing at all
  // (NfYe3P3G). `ClearFiltersButton`, the authored rail's copy, already reads
  // the URL this way; this is the sealed rail catching up.
  const allClearParams = [
    ...clearParams,
    ...[...searchParams.keys()].filter((k) => k.startsWith("f_") && !clearParams.includes(k)),
  ];
  const hasAny = allClearParams.some((p) => searchParams.get(p));

  return (
    <div className="rounded-[12px] border border-border bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-primary">Filters</span>
        {hasAny && (
          <button
            onClick={() => {
              const next = new URLSearchParams(searchParams.toString());
              [...allClearParams, "page"].forEach((p) => next.delete(p));
              router.replace(`${pathname}?${next.toString()}`, { scroll: false });
            }}
            className="text-xs font-semibold text-accent hover:text-accent-hover"
          >
            Clear all
          </button>
        )}
      </div>

      {groups.map((g) => {
        if (g.range) {
          return (
            <FacetGroup key={g.param} title={g.title} defaultOpen={g.defaultOpen}>
              <RangeFacet param={g.param} title={g.title} range={g.range} />
            </FacetGroup>
          );
        }
        // A ticked value stays on the rail even when this narrowing left it no
        // products of its own — otherwise the shopper cannot untick it.
        const ticked = new Set(searchParams.get(g.param)?.split(",").filter(Boolean) ?? []);
        const opts = g.options.filter((o) => o.count > 0 || ticked.has(o.value));
        if (opts.length === 0) return null;
        return (
          <FacetGroup key={g.param} title={g.title} defaultOpen={g.defaultOpen}>
            {opts.map((o) => (
              <FacetCheckbox key={o.value} param={g.param} value={o.value} label={o.label} count={o.count} />
            ))}
          </FacetGroup>
        );
      })}
    </div>
  );
}

/**
 * Min-max slider — the control Steve asked for in place of the old Industry
 * Kitchens tick-list of exact millimetre values (card C8G4f4U8, 2026-08-05).
 *
 * Two overlaid range inputs, so it is keyboard-operable and needs no library.
 * The URL is written on RELEASE, not on every pixel of the drag, and a thumb
 * left at either end writes no bound at all — the travel is trimmed to the 1st
 * to 99th percentile, so pinning the bound would quietly drop the extremes.
 */
function RangeFacet({
  param,
  title,
  range,
}: {
  param: string;
  title: string;
  range: { min: number; max: number; unit?: string; money?: boolean };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // A legacy band token (?price=lt1000) is shown as the window it covers, so
  // the thumbs never sit at full travel while the grid is actually narrowed.
  const raw = searchParams.get(param);
  const applied =
    parseRangeParam(raw) ?? (range.money ? priceBandWindow(parsePriceBands(raw)) : undefined);

  // The travel is the 1st-99th percentile of what the OTHER filters left, so an
  // applied window can fall entirely outside it — `sliderTravel` widens it to
  // contain the window rather than let both thumbs clamp to one end and
  // contradict the chip next to them. It also rounds the top up to the step
  // grid: a range input can only stop on steps measured from `min`, so a top
  // off that grid parks the thumb one step short and drops the dearest products.
  const travel = sliderTravel(range, applied);
  const step = travel.step;
  const lo = Math.max(travel.min, Math.min(travel.max, applied?.min ?? travel.min));
  const hi = Math.min(travel.max, Math.max(travel.min, applied?.max ?? travel.max));
  const [draft, setDraft] = useState<[number, number]>([lo, hi]);
  const [dragging, setDragging] = useState(false);
  // While the thumb is down the draft owns the value; otherwise the URL does,
  // so a chip removed elsewhere snaps the slider back.
  const [low, high] = dragging ? draft : [lo, hi];

  const format = (n: number) =>
    range.money ? formatPriceLabel({ min: n }).replace(" and up", "") : `${Number(n.toFixed(2)).toLocaleString("en-AU")}${range.unit ?? ""}`;

  const commit = (next: [number, number]) => {
    const value = rangeParamFor(travel, { min: next[0], max: next[1] });
    const params = new URLSearchParams(searchParams.toString());
    if (value === null) params.delete(param);
    else params.set(param, value);
    params.delete("page");
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  };

  const move = (which: 0 | 1) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    setDragging(true);
    setDraft(([a, b]) => (which === 0 ? [Math.min(value, b), b] : [a, Math.max(value, a)]));
  };
  const release = () => {
    if (!dragging) return;
    setDragging(false);
    commit(draft);
  };

  const left = ((low - travel.min) / (travel.max - travel.min)) * 100;
  const width = ((high - low) / (travel.max - travel.min)) * 100;

  return (
    <div className="pt-1">
      <div className="mb-2 flex items-center justify-between text-[12px] font-semibold text-accent-dark">
        <span>{format(low)}</span>
        <span>
          {format(high)}
          {high >= travel.max ? "+" : ""}
        </span>
      </div>
      <div className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-steel-200" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full"
          style={{ left: `${left}%`, width: `${width}%`, backgroundColor: "#00786F" }}
        />
        {([0, 1] as const).map((which) => (
          <input
            key={which}
            type="range"
            aria-label={which === 0 ? `Minimum ${title}` : `Maximum ${title}`}
            min={travel.min}
            max={travel.max}
            step={step}
            value={which === 0 ? low : high}
            onChange={move(which)}
            onPointerUp={release}
            onKeyUp={release}
            onBlur={release}
            className="pointer-events-none absolute inset-x-0 top-1/2 h-6 w-full -translate-y-1/2 appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-[#00786F] [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-[#00786F] [&::-webkit-slider-thumb]:shadow"
          />
        ))}
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-steel-400">
        <span>{format(travel.min)}</span>
        <span>{format(travel.max)}+</span>
      </div>
    </div>
  );
}

function FacetGroup({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-border py-3 first:border-t-0">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-[12.5px] font-bold text-text-primary"
      >
        {title}
        <ChevronDown className={`h-3.5 w-3.5 text-steel-400 transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && <div className="mt-2 space-y-1">{children}</div>}
    </div>
  );
}

export function FacetCheckbox({ param, value, label, count }: { param: string; value: string; label: string; count: number }) {
  const { selected, toggle } = useFacetParam(param);
  const checked = selected.includes(value);
  return (
    <label className="flex cursor-pointer items-center gap-2 py-1 text-[13px] text-ink-700 hover:text-accent">
      <input
        type="checkbox"
        checked={checked}
        onChange={() => toggle(value)}
        className="h-3.5 w-3.5 rounded-sm border-steel-300 accent-[#00786F]"
      />
      <span className="flex-1">{label}</span>
      <span className="text-xs text-steel-400">{count}</span>
    </label>
  );
}

/**
 * The per-category attribute sections, drawn INSIDE an authored filter rail
 * (card C8G4f4U8, reopened by Steve 2026-08-25).
 *
 * Which attributes a category offers is decided from that category's own data,
 * so an author cannot place a section per attribute per category — there are
 * thousands of categories and twelve possible attributes. The rail therefore
 * grows them at render time: `builder/category-facet-injection.ts` places this
 * leaf after the last authored facet group, and it draws whatever the listing
 * earned, using the same accordion, tick box and slider the sealed rail uses.
 *
 * A ticked value stays on screen even when this narrowing left it no products
 * of its own — otherwise the shopper cannot untick it. Same contract as
 * `RailContent`.
 */
export function AttributeFacetSections({ facets }: { facets: CategoryFacets }) {
  const searchParams = useSearchParams();
  const groups = attributeGroups(facets);
  if (groups.length === 0) return null;
  return (
    <>
      {groups.map((g) => {
        if (g.range) {
          return (
            <FacetGroup key={g.param} title={g.title} defaultOpen={g.defaultOpen}>
              <RangeFacet param={g.param} title={g.title} range={g.range} />
            </FacetGroup>
          );
        }
        const ticked = new Set(searchParams.get(g.param)?.split(",").filter(Boolean) ?? []);
        const opts = g.options.filter((o) => o.count > 0 || ticked.has(o.value));
        if (opts.length === 0) return null;
        return (
          <FacetGroup key={g.param} title={g.title} defaultOpen={g.defaultOpen}>
            {opts.map((o) => (
              <FacetCheckbox key={o.value} param={g.param} value={o.value} label={o.label} count={o.count} />
            ))}
          </FacetGroup>
        );
      })}
    </>
  );
}

/**
 * The Price min-max SLIDER, drawn inside an authored rail's own Price group in
 * place of its three legacy band tick boxes (C8G4f4U8 — Steve: "we don't want
 * long lists, we just want sliders").
 *
 * The authored group keeps its heading, its position and its open/collapsed
 * behaviour: the injection swaps only the option list, so NfYe3P3G's rule that
 * those three come from the designed page still holds. The band tokens keep
 * FILTERING — the slider draws the window a band covers (`priceBandWindow`) and
 * the band still names itself in the toolbar chips. Price switched off in
 * Products > Filtering renders nothing at all: `applyStorefrontFilters` nulls
 * the travel with the bands, so the slider cannot put the facet back.
 */
export function PriceSliderFacet({ facets }: { facets: CategoryFacets }) {
  const price = normalizeStorefrontFilters(facets.filters).find((f) => f.id === "price");
  if (!price?.enabled || !facets.priceRange) return null;
  return <RangeFacet param="price" title={price.label} range={{ ...facets.priceRange, money: true }} />;
}

/** Generic removable teal chips for the active facet selections (toolbar row). */
export function FacetChips({ groups }: { groups: FacetGroupDef[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const labelFor = (param: string, value: string) =>
    groups.find((g) => g.param === param)?.options.find((o) => o.value === value)?.label ?? value;

  const chips: { param: string; value: string; label: string }[] = [];
  for (const g of groups) {
    const raw = searchParams.get(g.param);
    if (!raw) continue;
    // A slider is ONE chip naming its window ("Width 600–900mm"), not one chip
    // per value — and removing it clears the whole window.
    if (g.range) {
      const window = parseRangeParam(raw);
      if (!window) {
        // Not a min-max window — a legacy price band. It still narrows the grid,
        // so it still gets a named, removable chip rather than disappearing.
        if (!g.range.money) continue;
        for (const band of parsePriceBands(raw)) {
          chips.push({ param: g.param, value: band, label: PRICE_LABELS[band] ?? band });
        }
        continue;
      }
      const label = g.range.money
        ? formatPriceLabel(window)
        : formatRangeLabel(window, g.range.unit);
      chips.push({ param: g.param, value: raw, label: `${g.title} ${label}` });
      continue;
    }
    for (const v of raw.split(",").filter(Boolean)) {
      chips.push({ param: g.param, value: v, label: labelFor(g.param, v) });
    }
  }

  if (chips.length === 0) return null;

  const remove = (param: string, value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    const set = new Set(next.get(param)?.split(",").filter(Boolean) ?? []);
    set.delete(value);
    if (set.size > 0) next.set(param, [...set].join(","));
    else next.delete(param);
    next.delete("page");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <button
          key={`${chip.param}-${chip.value}`}
          onClick={() => remove(chip.param, chip.value)}
          className="inline-flex items-center gap-1.5 rounded-full bg-accent-subtle px-3 py-1 text-xs font-semibold text-accent-dark transition-colors hover:bg-accent hover:text-white"
        >
          {chip.label}
          <X className="h-3 w-3" />
        </button>
      ))}
    </div>
  );
}

/** Category-page adapter — keeps the existing `<FilterChips facets={…} />` call site. */
export function FilterChips({ facets }: { facets: CategoryFacets }) {
  return <FacetChips groups={categoryGroups(facets)} />;
}

const DEFAULT_SORT_OPTIONS = [
  { value: "relevance", label: "Relevance" },
  { value: "price_asc", label: "Price: low → high" },
  { value: "price_desc", label: "Price: high → low" },
  { value: "saving", label: "Biggest saving" },
  { value: "newest", label: "Newest" },
];

/** Sort dropdown — writes ?sort= to the URL. Callers can override the options. */
export function SortSelect({ options = DEFAULT_SORT_OPTIONS }: { options?: { value: string; label: string }[] } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("sort") ?? "relevance";

  return (
    <label className="flex items-center gap-2 text-[13px] text-text-secondary">
      Sort
      <select
        value={current}
        onChange={(e) => {
          const next = new URLSearchParams(searchParams.toString());
          if (e.target.value === "relevance") next.delete("sort");
          else next.set("sort", e.target.value);
          next.delete("page");
          router.replace(`${pathname}?${next.toString()}`, { scroll: false });
        }}
        className="rounded-btn border border-border bg-white px-2.5 py-1.5 text-[13px] font-medium text-text-primary focus:border-accent focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
