"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Loader2 } from "lucide-react";

interface SearchHit {
  id: number;
  name: string;
  sku: string | null;
  urlPath: string | null;
  price: number;
  salePrice: number | null;
  brandName: string | null;
  thumbnailUrl: string | null;
  _formatted?: {
    name?: string;
  };
}

interface SearchResponse {
  hits: SearchHit[];
  query: string;
  estimatedTotalHits: number;
}

export function SearchTypeahead({ defaultValue }: { defaultValue?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(defaultValue || "");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hasInteracted = useRef(false);

  const fetchResults = useCallback(async (q: string) => {
    // Cancel any in-flight request
    abortRef.current?.abort();

    if (q.length < 2) {
      setResults(null);
      setIsOpen(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(q)}&limit=8`,
        { signal: controller.signal }
      );
      if (!res.ok) throw new Error("Search failed");
      const data: SearchResponse = await res.json();
      setResults(data);
      setIsOpen(data.hits.length > 0);
      setActiveIndex(-1);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setResults(null);
        setIsOpen(false);
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, []);

  // Debounced search — skip on initial mount to avoid dropdown over results
  useEffect(() => {
    if (!hasInteracted.current) return;
    clearTimeout(debounceRef.current);
    if (query.trim().length >= 2) {
      debounceRef.current = setTimeout(() => fetchResults(query.trim()), 200);
    } else {
      setResults(null);
      setIsOpen(false);
      setIsLoading(false);
    }
    return () => clearTimeout(debounceRef.current);
  }, [query, fetchResults]);

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

  function navigateToSearch(q: string) {
    if (q.trim()) {
      setIsOpen(false);
      router.push(`/search?q=${encodeURIComponent(q.trim())}`);
    }
  }

  function navigateToProduct(hit: SearchHit) {
    setIsOpen(false);
    router.push(`/products/${hit.urlPath || hit.id}`);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen || !results) {
      if (e.key === "Enter") {
        e.preventDefault();
        navigateToSearch(query);
      }
      return;
    }

    const totalItems = results.hits.length + (results.estimatedTotalHits > results.hits.length ? 1 : 0);

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
        if (activeIndex >= 0 && activeIndex < results.hits.length) {
          navigateToProduct(results.hits[activeIndex]);
        } else {
          navigateToSearch(query);
        }
        break;
      case "Escape":
        setIsOpen(false);
        setActiveIndex(-1);
        break;
    }
  }

  function formatPrice(price: number): string {
    return `$${price.toFixed(2)}`;
  }

  return (
    <div className="relative">
      {/* Search Input */}
      <div className="relative">
        {isLoading ? (
          <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-text-muted animate-spin" />
        ) : (
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-text-muted" strokeWidth={1.5} />
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
            if (results && results.hits.length > 0) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search products..."
          className="w-full pl-10 pr-10 py-3 input"
          autoFocus
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setResults(null);
              setIsOpen(false);
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* Dropdown Results */}
      {isOpen && results && results.hits.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full border border-border bg-white shadow-lg overflow-hidden"
        >
          <ul role="listbox">
            {results.hits.map((hit, index) => (
              <li
                key={hit.id}
                role="option"
                aria-selected={index === activeIndex}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-border last:border-b-0 ${
                  index === activeIndex ? "bg-surface-secondary" : "hover:bg-surface-secondary"
                }`}
                onClick={() => navigateToProduct(hit)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                {/* Thumbnail */}
                <div className="h-10 w-10 flex-shrink-0 bg-surface-secondary overflow-hidden">
                  {hit.thumbnailUrl ? (
                    <img
                      src={hit.thumbnailUrl}
                      alt=""
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
                  <p
                    className="text-sm font-medium text-text-primary truncate"
                    dangerouslySetInnerHTML={{
                      __html: hit._formatted?.name || hit.name,
                    }}
                  />
                  <p className="text-xs text-text-secondary truncate">
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
              </li>
            ))}
          </ul>

          {/* View All Results */}
          {results.estimatedTotalHits > results.hits.length && (
            <button
              type="button"
              className={`w-full px-4 py-3 text-sm text-center font-medium text-text-secondary hover:bg-surface-secondary border-t border-border ${
                activeIndex === results.hits.length ? "bg-surface-secondary" : ""
              }`}
              onClick={() => navigateToSearch(query)}
              onMouseEnter={() => setActiveIndex(results.hits.length)}
            >
              View all {results.estimatedTotalHits} results
            </button>
          )}
        </div>
      )}

      {/* No results message */}
      {isOpen && results && results.hits.length === 0 && query.length >= 2 && !isLoading && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full border border-border bg-white shadow-lg p-4"
        >
          <p className="text-sm text-text-secondary text-center">
            No results for &ldquo;{query}&rdquo;
          </p>
        </div>
      )}
    </div>
  );
}
