"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, X, SlidersHorizontal } from "lucide-react";

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
}

export interface CategoryFacets {
  subcategories: { id: number; name: string; slug: string; count: number }[];
  brands: { id: number; name: string; count: number }[];
  price: { key: string; count: number }[];
  availability: { key: string; count: number }[];
}

const PRICE_LABELS: Record<string, string> = {
  lt1000: "Under $1,000",
  "1000to3000": "$1,000–$3,000",
  gt3000: "$3,000+",
};
// Stock availability is deliberately NOT a shopper-facing facet — "In stock" was
// retired, so Clearance is the only availability option we label (and render).
const AVAIL_LABELS: Record<string, string> = {
  clearance: "Clearance",
};

/** Map the category page's CategoryFacets into the generic group list. */
function categoryGroups(facets: CategoryFacets): FacetGroupDef[] {
  const groups: FacetGroupDef[] = [];
  if (facets.subcategories.length > 0)
    groups.push({
      param: "sub",
      title: "Sub-category",
      options: facets.subcategories.map((f) => ({ value: String(f.id), label: f.name, count: f.count })),
    });
  if (facets.brands.length > 0)
    groups.push({
      param: "brand",
      title: "Brand",
      options: facets.brands.map((f) => ({ value: String(f.id), label: f.name, count: f.count })),
    });
  groups.push({
    param: "price",
    title: "Price (ex GST)",
    options: facets.price.map((f) => ({ value: f.key, label: PRICE_LABELS[f.key] ?? f.key, count: f.count })),
  });
  groups.push({
    param: "stock",
    title: "Availability",
    options: facets.availability
      .filter((f) => f.key in AVAIL_LABELS)
      .map((f) => ({ value: f.key, label: AVAIL_LABELS[f.key], count: f.count })),
  });
  return groups;
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
  const clearParams = ["sub", "brand", "price", "stock"];
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
  const clearParams = ["sub", "brand", "price", "stock"];
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
  return <FacetRail groups={categoryGroups(facets)} clearParams={["sub", "brand", "price", "stock"]} />;
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
  const hasAny = clearParams.some((p) => searchParams.get(p));

  return (
    <div className="rounded-[12px] border border-border bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-primary">Filters</span>
        {hasAny && (
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
        )}
      </div>

      {groups.map((g) => {
        const opts = g.options.filter((o) => o.count > 0);
        if (opts.length === 0) return null;
        return (
          <FacetGroup key={g.param} title={g.title}>
            {opts.map((o) => (
              <FacetCheckbox key={o.value} param={g.param} value={o.value} label={o.label} count={o.count} />
            ))}
          </FacetGroup>
        );
      })}
    </div>
  );
}

function FacetGroup({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
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

/** Generic removable teal chips for the active facet selections (toolbar row). */
export function FacetChips({ groups }: { groups: FacetGroupDef[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const labelFor = (param: string, value: string) =>
    groups.find((g) => g.param === param)?.options.find((o) => o.value === value)?.label ?? value;

  const chips: { param: string; value: string; label: string }[] = [];
  for (const g of groups) {
    for (const v of searchParams.get(g.param)?.split(",").filter(Boolean) ?? []) {
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
