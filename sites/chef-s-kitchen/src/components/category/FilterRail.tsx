"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, X, SlidersHorizontal } from "lucide-react";

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
const AVAIL_LABELS: Record<string, string> = {
  in_stock: "In stock",
  clearance: "Clearance",
};

/**
 * Design-system faceted filter rail: sticky 248px sidebar ≥1024px, off-canvas
 * drawer below. Selections update the URL query (?sub=&brand=&price=&stock=)
 * so filtered states are shareable and SSR-rendered; active facets show as
 * removable teal chips above the grid (rendered by FilterChips).
 */
export function FilterRail({ facets }: { facets: CategoryFacets }) {
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
        <RailContent facets={facets} />
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
            <RailContent facets={facets} />
          </div>
        </div>
      )}
    </>
  );
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

function RailContent({ facets }: { facets: CategoryFacets }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hasAny = ["sub", "brand", "price", "stock"].some((p) => searchParams.get(p));

  return (
    <div className="rounded-card border border-border bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-primary">Filters</span>
        {hasAny && (
          <button
            onClick={() => {
              const next = new URLSearchParams(searchParams.toString());
              ["sub", "brand", "price", "stock", "page"].forEach((p) => next.delete(p));
              router.replace(`${pathname}?${next.toString()}`, { scroll: false });
            }}
            className="text-xs font-semibold text-accent hover:text-accent-hover"
          >
            Clear all
          </button>
        )}
      </div>

      {facets.subcategories.length > 0 && (
        <FacetGroup title="Sub-category">
          {facets.subcategories.map((f) => (
            <FacetCheckbox key={f.id} param="sub" value={String(f.id)} label={f.name} count={f.count} />
          ))}
        </FacetGroup>
      )}

      {facets.brands.length > 0 && (
        <FacetGroup title="Brand">
          {facets.brands.map((f) => (
            <FacetCheckbox key={f.id} param="brand" value={String(f.id)} label={f.name} count={f.count} />
          ))}
        </FacetGroup>
      )}

      <FacetGroup title="Price (ex GST)">
        {facets.price.filter((f) => f.count > 0).map((f) => (
          <FacetCheckbox key={f.key} param="price" value={f.key} label={PRICE_LABELS[f.key] ?? f.key} count={f.count} />
        ))}
      </FacetGroup>

      <FacetGroup title="Availability">
        {facets.availability.filter((f) => f.count > 0).map((f) => (
          <FacetCheckbox key={f.key} param="stock" value={f.key} label={AVAIL_LABELS[f.key] ?? f.key} count={f.count} />
        ))}
      </FacetGroup>
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

function FacetCheckbox({ param, value, label, count }: { param: string; value: string; label: string; count: number }) {
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

/** Removable teal chips for the active facet selections (toolbar row). */
export function FilterChips({ facets }: { facets: CategoryFacets }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const chips: { param: string; value: string; label: string }[] = [];
  const add = (param: string, value: string, label: string) => chips.push({ param, value, label });

  for (const v of searchParams.get("sub")?.split(",").filter(Boolean) ?? []) {
    const f = facets.subcategories.find((s) => String(s.id) === v);
    if (f) add("sub", v, f.name);
  }
  for (const v of searchParams.get("brand")?.split(",").filter(Boolean) ?? []) {
    const f = facets.brands.find((b) => String(b.id) === v);
    add("brand", v, f?.name ?? `Brand ${v}`);
  }
  for (const v of searchParams.get("price")?.split(",").filter(Boolean) ?? []) {
    add("price", v, PRICE_LABELS[v] ?? v);
  }
  for (const v of searchParams.get("stock")?.split(",").filter(Boolean) ?? []) {
    add("stock", v, AVAIL_LABELS[v] ?? v);
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

/** Sort dropdown — writes ?sort= to the URL. */
export function SortSelect() {
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
        <option value="relevance">Relevance</option>
        <option value="price_asc">Price: low → high</option>
        <option value="price_desc">Price: high → low</option>
        <option value="saving">Biggest saving</option>
        <option value="newest">Newest</option>
      </select>
    </label>
  );
}
