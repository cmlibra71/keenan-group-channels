"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  hasMoreSuggestions,
  isSuggestionsCapped,
  nextSuggestionOffset,
  remainingSuggestions,
  suggestionPageSize,
  suggestionRequestUrl,
} from "@/lib/search-suggestions";

/**
 * One suggestion row. Must stay in step with `PUBLIC_HIT_FIELDS` in
 * `app/api/search/route.ts` — that allowlist is what stops the Meilisearch
 * document's `costPrice` reaching a browser, and this is its only consumer.
 */
export interface SuggestionHit {
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

type SuggestionResponse = {
  hits?: SuggestionHit[];
  query?: string;
  estimatedTotalHits?: number;
  offset?: number;
  consumed?: number;
};

/**
 * The header search bar's suggestion loader.
 *
 * Owns fetching, aborting and offset bookkeeping for the dropdown so the two
 * renderers that use it — `SearchTypeahead` (all three trees) and Industry
 * Kitchens' `HeaderSearch` — page identically. Only the markup differs between
 * them; before this hook the loader was copied into each one, which is how the
 * dropdown ended up showing eight rows with no scroll while `/search` scrolled
 * continuously (G3gpxN0k).
 *
 * Two rules it exists to keep:
 *  - it pages on POSITIONS CONSUMED, never on rows rendered. `/api/search`
 *    applies per-account catalogue scope after choosing its window, so a 40-row
 *    window can answer with 37 hits; paging on 37 would re-request the three
 *    that were skipped and the shopper would see duplicates.
 *  - `total` is fixed by the FIRST window and never overwritten. It is
 *    Meilisearch's estimate of the whole set, and later windows adjust their own
 *    copy of it downward when scope drops rows — letting a later window rewrite
 *    it would make "view all N results" count down as the shopper scrolled.
 *
 * The caller keeps the debounce, the open/closed state and the keyboard.
 */
export function useSearchSuggestions() {
  const [hits, setHits] = useState<SuggestionHit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(true);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  // The observer callback and the keyboard handler both close over whatever
  // they were created with, so the in-flight/finished state they must not race
  // lives in a ref rather than in state.
  const progress = useRef({ loading: false, offset: 0, done: true, query: "" });

  const remaining = remainingSuggestions(loaded, total);
  const hasMore = !done && remaining > 0;
  const capped = !hasMore && isSuggestionsCapped(total);

  const fetchWindow = useCallback(async (query: string, offset: number) => {
    const requested = suggestionPageSize(offset);
    if (requested <= 0) {
      progress.current.done = true;
      setDone(true);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const first = offset === 0;
    progress.current.loading = true;
    if (first) setLoading(true);
    else setLoadingMore(true);
    setFailed(false);

    try {
      const res = await fetch(suggestionRequestUrl(query, offset), {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Search failed");
      const data: SuggestionResponse = await res.json();

      // A response that outlived its query would splice another search's rows
      // into the open list. Abort usually prevents it; this is the belt.
      if (progress.current.query !== query) return;

      const rows = Array.isArray(data.hits) ? data.hits : [];
      // Positions consumed, taken before scope dropped anything. Older builds of
      // the endpoint did not report it; falling back to rows returned is the
      // safe direction (it can only stop the feed early, never duplicate).
      const consumed = typeof data.consumed === "number" ? data.consumed : rows.length;
      const next = nextSuggestionOffset(offset, consumed);

      if (first) {
        setHits(rows);
        setTotal(Math.max(0, data.estimatedTotalHits ?? rows.length));
      } else {
        setHits((prev) => [...prev, ...rows]);
      }
      // The offset must strictly advance, whatever the server said, or a window
      // that consumed nothing would be requested for ever.
      const advanced = next > progress.current.offset || first;
      progress.current.offset = Math.max(progress.current.offset, next);
      setLoaded(progress.current.offset);

      const more = advanced && hasMoreSuggestions({ nextOffset: next, consumed, requested });
      progress.current.done = !more;
      setDone(!more);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setFailed(true);
      if (first) {
        setHits([]);
        setTotal(0);
      }
      progress.current.done = true;
      setDone(true);
    } finally {
      // Only the CURRENT request owns the spinners. If a newer one has already
      // taken over (a keystroke landing mid-scroll aborts the load in flight),
      // clearing them here would switch off a spinner that is still true — and
      // clearing only the one this call set is how `loadingMore` used to stick
      // on for ever after a search interrupted a scroll load.
      if (abortRef.current === controller) {
        progress.current.loading = false;
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  /** Start a new search. Discards everything the previous query loaded. */
  const search = useCallback(
    (query: string) => {
      progress.current = { loading: false, offset: 0, done: true, query };
      setLoaded(0);
      setFailed(false);
      void fetchWindow(query, 0);
    },
    [fetchWindow]
  );

  /** Fetch the next window. Safe to call from an observer on every frame. */
  const loadMore = useCallback(() => {
    const p = progress.current;
    if (p.loading || p.done || !p.query) return;
    void fetchWindow(p.query, p.offset);
  }, [fetchWindow]);

  /** Drop everything and cancel anything in flight. */
  const reset = useCallback(() => {
    abortRef.current?.abort();
    progress.current = { loading: false, offset: 0, done: true, query: "" };
    setHits([]);
    setTotal(0);
    setLoaded(0);
    setLoading(false);
    setLoadingMore(false);
    setDone(true);
    setFailed(false);
  }, []);

  return {
    hits,
    total,
    /** The first window is in flight — the input shows its spinner. */
    loading,
    /** A later window is in flight — the foot of the list shows its spinner. */
    loadingMore,
    hasMore,
    remaining,
    /** The index holds more than the dropdown will ever show. */
    capped,
    failed,
    search,
    loadMore,
    reset,
  };
}

/**
 * How tall the suggestion panel may be, in pixels, so it never runs off the
 * bottom of the screen.
 *
 * A fixed `max-h-[70vh]` is not enough on a phone: the panel is anchored under
 * the search input, so the space it actually has is `viewport - input bottom`,
 * and on the `/search` page (input ~280px down a 844px screen) a 70vh panel
 * ended 26px past the fold — with `overscroll-contain` on the list, the pinned
 * "View all" footer under it was then hard to reach. Measured once the panel is
 * in the DOM and again on resize/orientation change.
 *
 * Returns `undefined` before the first measurement so the caller's CSS ceiling
 * governs the first paint rather than a guessed number.
 */
export function useDropdownMaxHeight(panel: HTMLElement | null): number | undefined {
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!panel) {
      setMaxHeight(undefined);
      return;
    }
    const measure = () => {
      const top = panel.getBoundingClientRect().top;
      // A floor, so a badly-placed input still leaves a usable list rather than
      // collapsing the panel to nothing.
      setMaxHeight(Math.max(240, Math.round(window.innerHeight - top - 12)));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [panel]);

  return maxHeight;
}
