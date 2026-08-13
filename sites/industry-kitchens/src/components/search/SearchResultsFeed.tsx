"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { MAX_RESULTS, type SearchFeedParams } from "@/lib/search-results";

export type SearchFeedChunk = {
  node: ReactNode;
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
 *  - the loader errors -> the feed stops where it is and offers a retry.
 */
export function SearchResultsFeed({
  children,
  gridClassName,
  params,
  loadMore,
  initialOffset,
  initialHasMore,
  total,
  fallbackHref,
}: {
  children: ReactNode;
  gridClassName: string;
  params: SearchFeedParams;
  loadMore: (params: SearchFeedParams, offset: number) => Promise<SearchFeedChunk>;
  /** Result POSITIONS the server render consumed (not tiles rendered). */
  initialOffset: number;
  /** False when the first render already exhausted the result set. */
  initialHasMore: boolean;
  /** The source's count for the whole result set. */
  total: number;
  /** Cumulative no-JavaScript link to the next page. */
  fallbackHref: string;
}) {
  const [chunks, setChunks] = useState<ReactNode[]>([]);
  const [offset, setOffset] = useState(initialOffset);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState(!initialHasMore);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // The observer callback closes over whatever it was created with, so the
  // in-flight/finished state it must not race lives in a ref, not in state.
  const progress = useRef({ loading: false, offset: initialOffset, done: !initialHasMore });

  const ceiling = Math.min(total, MAX_RESULTS);
  const remaining = Math.max(0, ceiling - offset);
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

  return (
    <>
      <div className={gridClassName}>
        {children}
        {chunks.map((chunk, i) => (
          <Fragment key={i}>{chunk}</Fragment>
        ))}
      </div>

      <p aria-live="polite" className="sr-only">
        Showing {Math.min(offset, ceiling)} of {total} results
      </p>

      {hasMore && (
        <div ref={sentinelRef} className="mt-10 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => void load()}
            disabled={pending}
            className="inline-flex items-center rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
          >
            {pending ? "Loading…" : `Load more (${remaining} remaining)`}
          </button>
          {failed && (
            <p className="text-sm text-zinc-500" role="alert">
              Something went wrong loading more results. Try again.
            </p>
          )}
          <noscript>
            <a href={fallbackHref} className="text-sm text-zinc-600 underline hover:text-zinc-900">
              Load more results
            </a>
          </noscript>
        </div>
      )}

      {!hasMore && total > MAX_RESULTS && (
        <p className="mt-10 text-center text-sm text-zinc-500">
          Showing the first {MAX_RESULTS} results. Add another word to your search to narrow it down.
        </p>
      )}
    </>
  );
}
