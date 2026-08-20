"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Loader2 } from "lucide-react";
import { useGst, adjustForGst } from "@/lib/gst";
import { MAX_SUGGESTIONS } from "@/lib/search-suggestions";
import {
  useDropdownMaxHeight,
  useSearchSuggestions,
  type SuggestionHit,
} from "./use-search-suggestions";

export function SearchTypeahead({ defaultValue }: { defaultValue?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(defaultValue || "");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const { inclusive, pricesIncludeTax } = useGst();

  // Fetching, aborting and offset bookkeeping live in the shared hook so this
  // dropdown and Industry Kitchens' HeaderSearch page identically (G3gpxN0k).
  const suggestions = useSearchSuggestions();
  const { hits, total, loading, loadingMore, hasMore, remaining, capped, failed } = suggestions;

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hasInteracted = useRef(false);
  // The scrolling panel and its foot are held in STATE, not refs: the panel is
  // only in the DOM while the dropdown is open, and a ref would still be null
  // on the render that opens it, so the observer would never attach.
  const [listEl, setListEl] = useState<HTMLUListElement | null>(null);
  const [sentinelEl, setSentinelEl] = useState<HTMLLIElement | null>(null);
  const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null);
  // The panel is anchored under the input, so its ceiling is the space left on
  // screen — a flat vh cap runs the pinned footer off the bottom on a phone.
  const panelMaxHeight = useDropdownMaxHeight(panelEl);
  // ONE stable ref callback for the panel. An inline arrow would be a new
  // function every render, which makes React detach (null) and re-attach it on
  // every commit — an avoidable extra render each time a window lands.
  const setPanel = useCallback((el: HTMLDivElement | null) => {
    dropdownRef.current = el;
    setPanelEl(el);
  }, []);

  const { search, loadMore, reset } = suggestions;

  const close = useCallback(() => {
    setIsOpen(false);
    setActiveIndex(-1);
  }, []);

  // Debounced search — skip on initial mount to avoid dropdown over results
  useEffect(() => {
    if (!hasInteracted.current) return;
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

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Load the next window as the foot of the LIST comes into view. The root is
  // the scrolling panel, not the page: the dropdown scrolls inside itself.
  useEffect(() => {
    if (!sentinelEl || !listEl || !hasMore || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { root: listEl, rootMargin: "300px 0px" }
    );
    observer.observe(sentinelEl);
    return () => observer.disconnect();
  }, [sentinelEl, listEl, hasMore, loadMore]);

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
    const el = listEl.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, listEl]);

  function navigateToSearch(q: string) {
    if (q.trim()) {
      close();
      router.push(`/search?q=${encodeURIComponent(q.trim())}`);
    }
  }

  function navigateToProduct(hit: SuggestionHit) {
    close();
    router.push(`/products/${hit.urlPath || hit.id}`);
  }

  const showViewAll = total > hits.length;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen || hits.length === 0) {
      if (e.key === "Enter") {
        e.preventDefault();
        navigateToSearch(query);
      }
      return;
    }

    const totalItems = hits.length + (showViewAll ? 1 : 0);

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((prev) => (prev < totalItems - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : totalItems - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < hits.length) {
          navigateToProduct(hits[activeIndex]);
        } else {
          navigateToSearch(query);
        }
        break;
      case "Escape":
        close();
        break;
    }
  }

  function formatPrice(price: number): string {
    return `$${adjustForGst(price, inclusive, pricesIncludeTax).toFixed(2)}`;
  }

  return (
    <div className="relative">
      {/* Search Input */}
      <div className="relative">
        {loading ? (
          <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400 animate-spin" />
        ) : (
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400" />
        )}
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => {
            hasInteracted.current = true;
            setQuery(e.target.value);
          }}
          onFocus={() => {
            if (hits.length > 0) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search products..."
          className="w-full pl-10 pr-10 py-3 rounded-lg border border-zinc-300 text-sm focus:border-zinc-500 focus:outline-none"
          autoFocus
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              reset();
              close();
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Dropdown Results — the list scrolls inside the panel and loads more as
          the reader reaches its bottom; "View all" stays pinned at the foot so
          it is one click away however far down the list they are. */}
      {isOpen && hits.length > 0 && (
        <div
          ref={setPanel}
          style={panelMaxHeight ? { maxHeight: panelMaxHeight } : undefined}
          className="absolute z-50 mt-1 flex max-h-[70vh] w-full flex-col rounded-lg border border-zinc-200 bg-white shadow-lg overflow-hidden"
        >
          <ul ref={setListEl} role="listbox" className="flex-1 overflow-y-auto overscroll-contain">
            {hits.map((hit, index) => (
              <li
                key={`${hit.id}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                data-active={index === activeIndex ? "true" : undefined}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-zinc-100 last:border-b-0 ${
                  index === activeIndex ? "bg-zinc-50" : "hover:bg-zinc-50"
                }`}
                onClick={() => navigateToProduct(hit)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                {/* Thumbnail */}
                <div className="h-10 w-10 flex-shrink-0 rounded bg-zinc-100 overflow-hidden">
                  {hit.thumbnailUrl ? (
                    <img
                      src={hit.thumbnailUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-zinc-300">
                      <Search className="h-4 w-4" />
                    </div>
                  )}
                </div>

                {/* Product Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 truncate">
                    {hit.name}
                  </p>
                  <p className="text-xs text-zinc-500 truncate">
                    {hit.brandName && <span>{hit.brandName}</span>}
                    {hit.brandName && hit.sku && <span> &middot; </span>}
                    {hit.sku && <span>{hit.sku}</span>}
                  </p>
                </div>

                {/* Price */}
                <div className="flex-shrink-0 text-right">
                  {hit.salePrice && hit.salePrice < hit.price ? (
                    <>
                      <p className="text-sm font-medium text-red-600">
                        {formatPrice(hit.salePrice)}
                      </p>
                      <p className="text-xs text-zinc-400 line-through">
                        {formatPrice(hit.price)}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm font-medium text-zinc-900">
                      {formatPrice(hit.price)}
                    </p>
                  )}
                </div>
              </li>
            ))}

            {/* The observer's target IS the button, so a viewport or zoom the
                observer cannot serve still has something real to click. */}
            {hasMore && (
              <li ref={setSentinelEl} className="border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => loadMore()}
                  disabled={loadingMore}
                  className="w-full px-4 py-3 text-sm text-center text-zinc-500 hover:bg-zinc-50 disabled:hover:bg-transparent"
                >
                  {loadingMore ? "Loading…" : `Load more (${remaining} remaining)`}
                </button>
                {failed && (
                  <p className="px-4 pb-3 text-center text-xs text-zinc-500" role="alert">
                    Something went wrong loading more results. Try again.
                  </p>
                )}
              </li>
            )}

            {/* Same sentence the results page ends on — without it the list just
                stops under a footer still offering "view all 1,000 results". */}
            {capped && (
              <li className="border-t border-zinc-100 px-4 py-3 text-center text-xs text-zinc-500">
                Showing the first {MAX_SUGGESTIONS} results. Add another word to your search to
                narrow it down.
              </li>
            )}
          </ul>

          {/* View All Results */}
          {showViewAll && (
            <button
              type="button"
              className={`w-full flex-shrink-0 px-4 py-3 text-sm text-center font-medium text-zinc-600 hover:bg-zinc-50 border-t border-zinc-200 ${
                activeIndex === hits.length ? "bg-zinc-50" : ""
              }`}
              onClick={() => navigateToSearch(query)}
              onMouseEnter={() => setActiveIndex(hits.length)}
            >
              View all {total} results
            </button>
          )}
        </div>
      )}

      {/* No results message */}
      {isOpen && hits.length === 0 && query.length >= 2 && !loading && (
        <div
          ref={setPanel}
          className="absolute z-50 mt-1 w-full rounded-lg border border-zinc-200 bg-white shadow-lg p-4"
        >
          <p className="text-sm text-zinc-500 text-center">
            No results for &ldquo;{query}&rdquo;
          </p>
        </div>
      )}
    </div>
  );
}
