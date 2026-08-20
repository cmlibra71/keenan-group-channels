"use client";

import { useState, useRef, useEffect, useCallback, useId } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { useGst, adjustForGst } from "@/lib/gst";
import { MAX_SUGGESTIONS } from "@/lib/search-suggestions";
import {
  useDropdownMaxHeight,
  useSearchSuggestions,
  type SuggestionHit,
} from "@/components/search/use-search-suggestions";

function formatPrice(price: number): string {
  return `$${price.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Header search with a live product-suggestion dropdown, matching the
// industrykitchens.com.au search-as-you-type behaviour. Falls back to a plain
// /search navigation on submit.
//
// The suggestion list scrolls inside its own panel and loads the next 40 as the
// reader reaches its bottom, up to the same 320-result ceiling /search stops at
// (G3gpxN0k) — the loader itself is the shared `useSearchSuggestions`, so this
// bar and Chefs Depot's masthead bar page identically and only the markup here
// is Industry Kitchens'.
export function HeaderSearch({
  placeholder = "Search",
  className = "hidden md:block flex-1 max-w-3xl",
}: {
  placeholder?: string;
  className?: string;
}) {
  const router = useRouter();
  const { inclusive, pricesIncludeTax } = useGst();
  const gstAdjust = (n: number) => adjustForGst(n, inclusive, pricesIncludeTax);
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const suggestions = useSearchSuggestions();
  const { hits, total, loading, loadingMore, hasMore, remaining, capped, failed } = suggestions;
  const { search, loadMore, reset } = suggestions;

  // Stable ids so the input can point at the listbox and at the row the
  // keyboard is on — with a list this long, arrow-key travel is the only
  // keyboard route to a deep row and a screen reader has to be able to follow it.
  const listboxId = useId();
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Held in STATE, not refs: the panel is only in the DOM while the dropdown is
  // open, so a ref would still be null on the render that opens it and the
  // observer would never attach.
  const [listEl, setListEl] = useState<HTMLUListElement | null>(null);
  const [sentinelEl, setSentinelEl] = useState<HTMLLIElement | null>(null);
  const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null);
  // The panel is anchored under the input, so its ceiling is the space left on
  // screen — a flat vh cap runs the pinned footer off the bottom on a phone.
  const panelMaxHeight = useDropdownMaxHeight(panelEl);

  const close = useCallback(() => {
    setIsOpen(false);
    setActiveIndex(-1);
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (trimmed.length >= 2) {
      debounceRef.current = setTimeout(() => {
        search(trimmed);
        setIsOpen(true);
        setActiveIndex(-1);
      }, 200);
    } else {
      reset();
      close();
    }
    return () => clearTimeout(debounceRef.current);
  }, [query, search, reset, close]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Load the next window as the foot of the LIST comes into view. The root is
  // the scrolling panel, not the page: the dropdown scrolls inside itself.
  // `failed` is a guard, not decoration: after a window fails the sentinel is
  // still sitting in view, so an observer left attached would retry on every
  // scroll jiggle for as long as the outage lasts. The retry is the button.
  useEffect(() => {
    if (!sentinelEl || !listEl || !hasMore || failed) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { root: listEl, rootMargin: "300px 0px" }
    );
    observer.observe(sentinelEl);
    return () => observer.disconnect();
  }, [sentinelEl, listEl, hasMore, failed, loadMore]);

  // A window can be shorter than the panel (per-account visibility drops rows),
  // and the observer only fires on a CHANGE — so re-check once each load
  // settles, or the list stalls with the sentinel sitting on screen.
  useEffect(() => {
    if (loadingMore || !hasMore || failed || !sentinelEl || !listEl) return;
    if (sentinelEl.getBoundingClientRect().top <= listEl.getBoundingClientRect().bottom) {
      const t = setTimeout(() => loadMore(), 250);
      return () => clearTimeout(t);
    }
  }, [loadingMore, hasMore, failed, loadMore, hits.length, sentinelEl, listEl]);

  // Keep the keyboard selection inside the scrolling panel.
  useEffect(() => {
    if (activeIndex < 0 || !listEl) return;
    listEl.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, listEl]);

  function goToSearch(q: string) {
    if (q.trim()) {
      close();
      router.push(`/search?q=${encodeURIComponent(q.trim())}`);
    }
  }

  function goToProduct(hit: SuggestionHit) {
    close();
    router.push(`/products/${hit.urlPath || hit.id}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!isOpen || hits.length === 0) return;
    const totalItems = hits.length + 1; // +1 for "view all"
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((p) => (p < totalItems - 1 ? p + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((p) => (p > 0 ? p - 1 : totalItems - 1));
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && activeIndex < hits.length) {
        e.preventDefault();
        goToProduct(hits[activeIndex]);
      }
    } else if (e.key === "Escape") {
      close();
    }
  }

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          goToSearch(query);
        }}
        className="flex"
      >
        <input
          type="search"
          name="q"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (hits.length > 0) setIsOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label="Search"
          role="combobox"
          aria-expanded={isOpen && hits.length > 0}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            isOpen && activeIndex >= 0 && activeIndex < hits.length
              ? optionId(activeIndex)
              : undefined
          }
          autoComplete="off"
          className="min-w-0 flex-1 rounded-l-md border border-r-0 border-zinc-300 px-4 py-2.5 text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:border-[#D94B2B]"
        />
        <button
          type="submit"
          aria-label="Search"
          className="flex items-center justify-center rounded-r-md bg-[#D94B2B] px-4 text-white hover:bg-[#C73629] transition-colors"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
        </button>
      </form>

      {/* Suggestion dropdown — scrolls inside the panel, "View all" pinned at
          the foot so it stays one click away however far the reader scrolls. */}
      {isOpen && (hits.length > 0 || (!loading && query.trim().length >= 2)) && (
        <div
          ref={setPanelEl}
          style={panelMaxHeight ? { maxHeight: panelMaxHeight } : undefined}
          className="absolute left-0 right-0 z-50 mt-1 flex max-h-[70vh] flex-col overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg"
        >
          {hits.length > 0 ? (
            <>
              <ul
                ref={setListEl}
                id={listboxId}
                role="listbox"
                className="flex-1 overflow-y-auto overscroll-contain"
              >
                {hits.map((hit, index) => {
                  const sale = hit.salePrice && hit.salePrice < hit.price;
                  return (
                    <li
                      key={`${hit.id}-${index}`}
                      id={optionId(index)}
                      role="option"
                      aria-selected={index === activeIndex}
                      data-active={index === activeIndex ? "true" : undefined}
                      onClick={() => goToProduct(hit)}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={`flex cursor-pointer items-center gap-3 border-b border-zinc-100 px-4 py-2.5 last:border-b-0 ${
                        index === activeIndex ? "bg-zinc-50" : "hover:bg-zinc-50"
                      }`}
                    >
                      <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-zinc-100">
                        {hit.thumbnailUrl ? (
                          // Lazy: a first window is 40 thumbnails and a full
                          // scroll is 320, on every settled keystroke, and lazy
                          // loading works inside a clipped scroll container.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={hit.thumbnailUrl}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-zinc-300">
                            <Search className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-900">
                          {hit.name}
                        </p>
                        {(hit.brandName || hit.sku) && (
                          <p className="truncate text-xs text-zinc-500">
                            {hit.brandName}
                            {hit.brandName && hit.sku ? " · " : ""}
                            {hit.sku}
                          </p>
                        )}
                      </div>
                      {hit.price > 0 && (
                        <div className="flex-shrink-0 text-right">
                          {sale ? (
                            <>
                              <p className="text-sm font-bold text-[#D94B2B]">
                                {formatPrice(gstAdjust(hit.salePrice!))}
                              </p>
                              <p className="text-xs text-zinc-400 line-through">
                                {formatPrice(gstAdjust(hit.price))}
                              </p>
                            </>
                          ) : (
                            <p className="text-sm font-semibold text-zinc-900">
                              {formatPrice(gstAdjust(hit.price))}
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}

                {/* The observer's target IS the button, so a viewport or zoom
                    the observer cannot serve still has something real to click. */}
                {hasMore && (
                  // Not an option — a listbox child that is not selectable
                  // must say so, or a screen reader counts the loader as a
                  // product.
                  <li ref={setSentinelEl} role="presentation" className="border-t border-zinc-100">
                    <button
                      type="button"
                      onClick={() => loadMore()}
                      disabled={loadingMore}
                      className="w-full px-4 py-2.5 text-center text-sm text-zinc-500 hover:bg-zinc-50 disabled:hover:bg-transparent"
                    >
                      {loadingMore ? "Loading…" : `Load more (${remaining} remaining)`}
                    </button>
                    {failed && (
                      <p className="px-4 pb-2.5 text-center text-xs text-zinc-500" role="alert">
                        Something went wrong loading more results. Try again.
                      </p>
                    )}
                  </li>
                )}

                {/* Same sentence the results page ends on — without it the list
                    just stops under a footer still offering "view all" more. */}
                {capped && (
                  <li
                    role="presentation"
                    className="border-t border-zinc-100 px-4 py-2.5 text-center text-xs text-zinc-500"
                  >
                    Showing the first {MAX_SUGGESTIONS} results. Add another word to your search to
                    narrow it down.
                  </li>
                )}
              </ul>
              {/* The link OUT of the dropdown survives a full scroll — it is
                  never keyed on `total > hits.length`, which would delete it
                  the moment the reader reached the end of a 41–320 result set,
                  i.e. exactly the reader who has run out of dropdown and most
                  needs the results page and its facets. Only the COUNT drops
                  once the whole set is on screen. Chefs Depot's bar
                  (components/search/SearchTypeahead.tsx) does the same; the two
                  bars must not disagree about this. */}
              <button
                type="button"
                onClick={() => goToSearch(query)}
                onMouseEnter={() => setActiveIndex(hits.length)}
                className={`block w-full flex-shrink-0 border-t border-zinc-200 px-4 py-2.5 text-center text-sm font-semibold text-[#D94B2B] hover:bg-zinc-50 ${
                  activeIndex === hits.length ? "bg-zinc-50" : ""
                }`}
              >
                View all {total > hits.length ? `${total} ` : ""}results
              </button>
            </>
          ) : failed ? (
            /* A request that never came back is not a catalogue that holds
               nothing. /api/search answers 503 whenever Meilisearch is
               unavailable and has no Postgres fallback of its own, so an
               outage is silence — and "no results" would tell the shopper we
               do not sell what we do sell, on the same page where /search
               would still list it. */
            <p className="px-4 py-4 text-center text-sm text-zinc-500" role="alert">
              Search is temporarily unavailable. Please try again in a moment.
            </p>
          ) : (
            <p className="px-4 py-4 text-center text-sm text-zinc-500">
              No results for &ldquo;{query}&rdquo;
            </p>
          )}
        </div>
      )}
    </div>
  );
}
