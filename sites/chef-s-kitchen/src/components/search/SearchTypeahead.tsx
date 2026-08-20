"use client";

import { useState, useRef, useEffect, useCallback, useId } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Loader2 } from "lucide-react";
import { useGst, adjustForGst } from "@/lib/gst";
import { MAX_SUGGESTIONS } from "@/lib/search-suggestions";
import {
  useDropdownMaxHeight,
  useSearchSuggestions,
  type SuggestionHit,
} from "./use-search-suggestions";

export function SearchTypeahead({ defaultValue, inline, variant }: { defaultValue?: string; inline?: boolean; variant?: "masthead" }) {
  const router = useRouter();
  const [query, setQuery] = useState(defaultValue || "");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const { inclusive, pricesIncludeTax } = useGst();

  // Fetching, aborting and offset bookkeeping live in the shared hook so this
  // dropdown and Industry Kitchens' HeaderSearch page identically (G3gpxN0k).
  const suggestions = useSearchSuggestions();
  const { hits, total, loading, loadingMore, hasMore, remaining, capped, failed } = suggestions;

  // Stable ids so the input can point at the listbox and at the row the
  // keyboard is on — with a list this long, arrow-key travel is the only
  // keyboard route to a deep row and a screen reader has to be able to follow it.
  const listboxId = useId();
  const optionId = (index: number) => `${listboxId}-option-${index}`;

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

  // The link OUT of the dropdown survives a full scroll. Keying it on
  // `total > hits.length` used to delete it the moment the reader reached the
  // end of a 41–320 result set — exactly the reader who has run out of dropdown
  // and most needs the results page, with its facets and its sort. Industry
  // Kitchens' bar has always rendered it unconditionally; both bars now do, and
  // both drop the count once the whole set is on screen rather than claiming
  // there are more.
  const showCount = total > hits.length;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen || hits.length === 0) {
      if (e.key === "Enter") {
        e.preventDefault();
        navigateToSearch(query);
      }
      return;
    }

    const totalItems = hits.length + 1; // +1 for the pinned "view all" row

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
          <Loader2
            className={`absolute top-1/2 -translate-y-1/2 animate-spin ${
              variant === "masthead"
                ? "left-4 z-10 h-[17px] w-[17px] text-white/85"
                : `left-3 text-text-muted ${inline ? "h-4 w-4" : "h-5 w-5"}`
            }`}
          />
        ) : (
          <Search
            className={`absolute top-1/2 -translate-y-1/2 ${
              variant === "masthead"
                ? "left-4 z-10 h-[17px] w-[17px] text-white/85"
                : `left-3 text-text-muted ${inline ? "h-4 w-4" : "h-5 w-5"}`
            }`}
            strokeWidth={variant === "masthead" ? 2 : 1.5}
          />
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
          role="combobox"
          aria-expanded={isOpen && hits.length > 0}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            isOpen && activeIndex >= 0 && activeIndex < hits.length
              ? optionId(activeIndex)
              : undefined
          }
          placeholder="Search products..."
          className={
            variant === "masthead"
              ? "h-11 w-full rounded-full border border-white/[0.32] bg-white/[0.16] pl-11 pr-10 text-sm text-white placeholder-white/80 backdrop-blur-[4px] focus:border-white/60 focus:outline-none"
              : inline
                ? "w-full pl-10 pr-10 py-2 text-sm border border-border focus:border-text-primary focus:outline-none"
                : "w-full pl-10 pr-10 py-3 input-search"
          }
          autoFocus={!inline}
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
            className={`absolute right-3 top-1/2 -translate-y-1/2 ${variant === "masthead" ? "text-white/70 hover:text-white" : "text-text-muted hover:text-text-secondary"}`}
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
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
          className="absolute z-50 mt-1 flex max-h-[70vh] w-full flex-col border border-border bg-white shadow-lg overflow-hidden"
        >
          <ul
            ref={setListEl}
            id={listboxId}
            role="listbox"
            className="flex-1 overflow-y-auto overscroll-contain"
          >
            {hits.map((hit, index) => (
              <li
                key={`${hit.id}-${index}`}
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                data-active={index === activeIndex ? "true" : undefined}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-border last:border-b-0 ${
                  index === activeIndex ? "bg-surface-secondary" : "hover:bg-surface-secondary"
                }`}
                onClick={() => navigateToProduct(hit)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                {/* Thumbnail */}
                <div className="h-10 w-10 flex-shrink-0 bg-surface-secondary overflow-hidden">
                  {hit.thumbnailUrl ? (
                    // Lazy: a first window is 40 thumbnails and a full scroll is
                    // 320, on every settled keystroke, and lazy loading works
                    // inside a clipped scroll container.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={hit.thumbnailUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-text-muted">
                      <Search className="h-4 w-4" strokeWidth={1.5} />
                    </div>
                  )}
                </div>

                {/* Product Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {hit.name}
                  </p>
                  <p className="text-xs text-text-secondary truncate">
                    {hit.brandName && <span>{hit.brandName}</span>}
                    {hit.brandName && hit.sku && <span> &middot; </span>}
                    {hit.sku && <span>{hit.sku}</span>}
                  </p>
                </div>

                {/* Price. A product with no price is sold by quote, not for
                    nothing: the tile (ProductCard `hasPrice`), the product page
                    and Industry Kitchens' own bar all show no figure at all
                    rather than "$0.00", so this one does too. */}
                {hit.price > 0 && (
                  <div className="flex-shrink-0 text-right">
                    {hit.salePrice && hit.salePrice < hit.price ? (
                      <>
                        <p className="text-sm font-medium text-sale">
                          {formatPrice(hit.salePrice)}
                        </p>
                        <p className="text-xs text-text-muted line-through">
                          {formatPrice(hit.price)}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm font-medium text-text-primary">
                        {formatPrice(hit.price)}
                      </p>
                    )}
                  </div>
                )}
              </li>
            ))}

            {/* The observer's target IS the button, so a viewport or zoom the
                observer cannot serve still has something real to click. */}
            {hasMore && (
              // Not an option — a listbox child that is not selectable must say
              // so, or a screen reader counts the loader as a product.
              <li ref={setSentinelEl} role="presentation" className="border-t border-border">
                <button
                  type="button"
                  onClick={() => loadMore()}
                  disabled={loadingMore}
                  className="w-full px-4 py-3 text-sm text-center text-text-secondary hover:bg-surface-secondary disabled:hover:bg-transparent"
                >
                  {loadingMore ? "Loading…" : `Load more (${remaining} remaining)`}
                </button>
                {failed && (
                  <p className="px-4 pb-3 text-center text-xs text-text-secondary" role="alert">
                    Something went wrong loading more results. Try again.
                  </p>
                )}
              </li>
            )}

            {/* Same sentence the results page ends on — without it the list just
                stops under a footer still offering "view all 1,000 results". */}
            {capped && (
              <li
                role="presentation"
                className="border-t border-border px-4 py-3 text-center text-xs text-text-secondary"
              >
                Showing the first {MAX_SUGGESTIONS} results. Add another word to your search to
                narrow it down.
              </li>
            )}
          </ul>

          {/* View All Results — pinned below the scrolling list, and rendered
              whatever the reader has scrolled past. */}
          <button
            type="button"
            className={`w-full flex-shrink-0 px-4 py-3 text-sm text-center font-medium text-text-secondary hover:bg-surface-secondary border-t border-border ${
              activeIndex === hits.length ? "bg-surface-secondary" : ""
            }`}
            onClick={() => navigateToSearch(query)}
            onMouseEnter={() => setActiveIndex(hits.length)}
          >
            View all {showCount ? `${total} ` : ""}results
          </button>
        </div>
      )}

      {/* Nothing to show. Which of the two reasons it is matters: a request that
          never came back is not the same as a catalogue that holds nothing, and
          /api/search answers 503 whenever Meilisearch is unavailable (it has no
          Postgres fallback of its own, so an outage is silence, not an empty
          set). Saying "no results" there tells the shopper we do not sell what
          we do sell — on the same page where /search would still list it. */}
      {isOpen && hits.length === 0 && query.length >= 2 && !loading && (
        <div
          ref={setPanel}
          className="absolute z-50 mt-1 w-full border border-border bg-white shadow-lg p-4"
        >
          {failed ? (
            <p className="text-sm text-text-secondary text-center" role="alert">
              Search is temporarily unavailable. Please try again in a moment.
            </p>
          ) : (
            <p className="text-sm text-text-secondary text-center">
              No results for &ldquo;{query}&rdquo;
            </p>
          )}
        </div>
      )}
    </div>
  );
}
