"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  MAX_RESULTS,
  isCappedByLimit,
  remainingResults,
  type SearchFeedParams,
} from "@/lib/search-results";

export type SearchFeedChunk = {
  node: ReactNode;
  /** Tiles this chunk actually rendered, AFTER per-account visibility. */
  count: number;
  nextOffset: number;
  hasMore: boolean;
};

/**
 * Continuous-scroll search results.
 *
 * The first page is server-rendered and handed in as `children`; each further
 * page is fetched by a SERVER ACTION that returns the already-rendered grid
 * (`loadMore`). Rendering stays on the server on purpose: per-account
 * visibility, contract prices and member prices are applied in ProductGrid, so
 * a client-side fetch of raw rows would have to re-derive them in the browser —
 * exactly the state the shared Meilisearch index is not allowed to carry.
 *
 * Every chunk is rendered with `display: contents`, so all of them join ONE
 * grid: a chunk shortened by per-account visibility cannot leave a half-empty
 * row between itself and the next.
 *
 * Degradations, in order:
 *  - observer never fires (odd viewport, zoom, keyboard-only) -> the button is
 *    real and does the same thing;
 *  - JavaScript off -> `<noscript>` link to the cumulative `?page=N+1` render;
 *  - the loader errors -> the feed stops where it is and offers a retry;
 *  - every result belongs to another account -> once the feed has walked the
 *    whole set having rendered NOTHING, the page's own "no products" wording is
 *    shown. Result COUNT is not the same as tiles shown: per-account visibility
 *    is applied after the shared index, so a 40-hit chunk can legitimately draw
 *    zero tiles, and a blank grid with no wording is the state this must never
 *    leave a shopper in.
 */
export function SearchResultsFeed({
  children,
  gridClassName,
  params,
  loadMore,
  initialOffset,
  initialCount,
  initialHasMore,
  total,
  fallbackHref,
  emptyState,
}: {
  children: ReactNode;
  gridClassName: string;
  params: SearchFeedParams;
  loadMore: (params: SearchFeedParams, offset: number) => Promise<SearchFeedChunk>;
  /** Result POSITIONS the server render consumed (not tiles rendered). */
  initialOffset: number;
  /** Tiles the server render actually drew, AFTER per-account visibility. */
  initialCount: number;
  /** False when the first render already exhausted the result set. */
  initialHasMore: boolean;
  /** The source's count for the whole result set. */
  total: number;
  /** Cumulative no-JavaScript link to the next page. */
  fallbackHref: string;
  /** Shown when the feed finishes having rendered no tiles at all. */
  emptyState: ReactNode;
}) {
  const [chunks, setChunks] = useState<ReactNode[]>([]);
  const [offset, setOffset] = useState(initialOffset);
  const [rendered, setRendered] = useState(initialCount);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState(!initialHasMore);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // The observer callback closes over whatever it was created with, so the
  // in-flight/finished state it must not race lives in a ref, not in state.
  const progress = useRef({ loading: false, offset: initialOffset, done: !initialHasMore });

  const remaining = remainingResults(offset, total);
  const hasMore = !done && remaining > 0;

  const load = useCallback(async () => {
    const p = progress.current;
    if (p.loading || p.done || p.offset >= MAX_RESULTS) return;
    p.loading = true;
    setPending(true);
    setFailed(false);
    try {
      const chunk = await loadMore(params, p.offset);
      if (chunk?.node) setChunks((prev) => [...prev, chunk.node]);
      if (chunk?.count) setRendered((n) => n + chunk.count);
      // The offset must strictly advance, whatever the server said, or a chunk
      // that consumed nothing would be requested for ever.
      const next = Math.max(0, chunk?.nextOffset ?? 0);
      const advanced = next > p.offset;
      if (advanced) {
        p.offset = next;
        setOffset(next);
      }
      if (!chunk?.hasMore || !advanced || p.offset >= MAX_RESULTS) {
        p.done = true;
        setDone(true);
      }
    } catch {
      setFailed(true);
    } finally {
      p.loading = false;
      setPending(false);
    }
  }, [loadMore, params]);

  // Auto-load as the end of the list comes into view. The margin starts the
  // fetch about a screen early, so the next tiles are usually there before the
  // shopper reaches the bottom.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void load();
      },
      { rootMargin: "600px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [load]);

  // A chunk can be shorter than the viewport (a tall screen, or rows dropped by
  // per-account visibility). The observer only fires on a CHANGE, so re-check
  // once each load settles, or the feed stalls with the sentinel on screen.
  useEffect(() => {
    if (pending || !hasMore || failed) return;
    const el = sentinelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.top <= window.innerHeight) {
      const t = setTimeout(() => void load(), 250);
      return () => clearTimeout(t);
    }
  }, [pending, hasMore, failed, load, chunks.length]);

  // Nothing left to fetch and not one tile drawn: the grid is blank and the only
  // thing that can explain it is the page's own empty state.
  if (!hasMore && !pending && rendered === 0) return <>{emptyState}</>;

  return (
    <>
      <div className={gridClassName}>
        {children}
        {chunks.map((chunk, i) => (
          <Fragment key={i}>{chunk}</Fragment>
        ))}
      </div>

      {/* Announces TILES DRAWN, never the source's count: `total` is
          Meilisearch's estimate capped at its own maxTotalHits (a CD search for
          "oven" reports 1000 while 320 are reachable), so announcing it told a
          screen-reader user the feed had more to give and then stopped. */}
      <p aria-live="polite" className="sr-only">
        {pending
          ? "Loading more results."
          : `Showing ${rendered} product${rendered === 1 ? "" : "s"}.`}
      </p>

      {hasMore && (
        <div ref={sentinelRef} className="mt-10 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => void load()}
            disabled={pending}
            className="inline-flex items-center border border-border bg-white px-5 py-2.5 text-sm font-semibold text-text-body transition-colors duration-300 hover:bg-surface-primary disabled:cursor-not-allowed disabled:text-text-muted"
          >
            {pending ? "Loading…" : `Load more (${remaining} remaining)`}
          </button>
          {failed && (
            <p className="text-sm text-text-secondary" role="alert">
              Something went wrong loading more results. Try again.
            </p>
          )}
          <noscript>
            <a
              href={fallbackHref}
              className="text-sm text-text-secondary underline transition-colors duration-300 hover:text-text-primary"
            >
              Load more results
            </a>
          </noscript>
        </div>
      )}

      {!hasMore && isCappedByLimit(total) && (
        <p className="mt-10 text-center text-sm text-text-secondary">
          Showing the first {MAX_RESULTS} results. Add another word to your search to narrow it down.
        </p>
      )}
    </>
  );
}
