"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { useGst, adjustForGst } from "@/lib/gst";

interface SearchHit {
  id: number;
  name: string;
  sku: string | null;
  urlPath: string | null;
  price: number;
  salePrice: number | null;
  brandName: string | null;
  thumbnailUrl: string | null;
  _formatted?: { name?: string };
}

interface SearchResponse {
  hits: SearchHit[];
  query: string;
  estimatedTotalHits: number;
}

function formatPrice(price: number): string {
  return `$${price.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Header search with a live product-suggestion dropdown, matching the
// industrykitchens.com.au search-as-you-type behaviour. Falls back to a plain
// /search navigation on submit.
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
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const wrapRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchResults = useCallback(async (q: string) => {
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
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=8`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Search failed");
      const data: SearchResponse = await res.json();
      setResults(data);
      setIsOpen(true);
      setActiveIndex(-1);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setResults(null);
        setIsOpen(false);
      }
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
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

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function goToSearch(q: string) {
    if (q.trim()) {
      setIsOpen(false);
      router.push(`/search?q=${encodeURIComponent(q.trim())}`);
    }
  }

  function goToProduct(hit: SearchHit) {
    setIsOpen(false);
    router.push(`/products/${hit.urlPath || hit.id}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!isOpen || !results || results.hits.length === 0) return;
    const total = results.hits.length + 1; // +1 for "view all"
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((p) => (p < total - 1 ? p + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((p) => (p > 0 ? p - 1 : total - 1));
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && activeIndex < results.hits.length) {
        e.preventDefault();
        goToProduct(results.hits[activeIndex]);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
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
            if (results && results.hits.length > 0) setIsOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label="Search"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-l-md border border-r-0 border-zinc-300 px-4 py-2.5 text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:border-[#D94B2B]"
        />
        <button
          type="submit"
          aria-label="Search"
          className="flex items-center justify-center rounded-r-md bg-[#D94B2B] px-4 text-white hover:bg-[#C73629] transition-colors"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
        </button>
      </form>

      {/* Suggestion dropdown */}
      {isOpen && results && (
        <div className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg">
          {results.hits.length > 0 ? (
            <>
              <ul role="listbox">
                {results.hits.map((hit, index) => {
                  const sale = hit.salePrice && hit.salePrice < hit.price;
                  return (
                    <li
                      key={hit.id}
                      role="option"
                      aria-selected={index === activeIndex}
                      onClick={() => goToProduct(hit)}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={`flex cursor-pointer items-center gap-3 border-b border-zinc-100 px-4 py-2.5 last:border-b-0 ${
                        index === activeIndex ? "bg-zinc-50" : "hover:bg-zinc-50"
                      }`}
                    >
                      <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-zinc-100">
                        {hit.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={hit.thumbnailUrl}
                            alt=""
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-zinc-300">
                            <Search className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-sm font-medium text-zinc-900"
                          dangerouslySetInnerHTML={{
                            __html: hit._formatted?.name || hit.name,
                          }}
                        />
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
              </ul>
              <button
                type="button"
                onClick={() => goToSearch(query)}
                onMouseEnter={() => setActiveIndex(results.hits.length)}
                className={`block w-full border-t border-zinc-200 px-4 py-2.5 text-center text-sm font-semibold text-[#D94B2B] hover:bg-zinc-50 ${
                  activeIndex === results.hits.length ? "bg-zinc-50" : ""
                }`}
              >
                View all{" "}
                {results.estimatedTotalHits > results.hits.length
                  ? `${results.estimatedTotalHits} `
                  : ""}
                results
              </button>
            </>
          ) : (
            !isLoading &&
            query.trim().length >= 2 && (
              <p className="px-4 py-4 text-center text-sm text-zinc-500">
                No results for &ldquo;{query}&rdquo;
              </p>
            )
          )}
        </div>
      )}
    </div>
  );
}
