"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Stamps the product a shopper opened onto the search that produced it (card LjdIfc92).
 *
 * Wraps the results feed and listens for clicks in the CAPTURE phase, because the tile is a
 * `<Link>` and the navigation starts the moment the click bubbles. It reads the product id off
 * the tile's own `data-product-id` attribute rather than being handed a list of ids: the feed
 * appends further pages as SERVER-RENDERED nodes, so a prop-passed map would only ever cover the
 * first forty results.
 *
 * `navigator.sendBeacon` is the whole point — the request survives the navigation the click is
 * about to start, and it cannot delay it. Everything here is wrapped: a click must never fail
 * because it was being counted.
 *
 * FIRST CLICK WINS, matching `recordSearchClick` on the server. The ref is the cheap half; the
 * server's `clicked_product_id IS NULL` is the half that actually holds.
 */
export function SearchClickLogger({
  searchLogId,
  children,
}: {
  /** The `search_log` row this page's results came from. Null when nothing was logged. */
  searchLogId: string | null;
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sent = useRef(false);

  useEffect(() => {
    if (!searchLogId) return;
    const el = containerRef.current;
    if (!el) return;

    function onClick(event: MouseEvent) {
      if (sent.current) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const tile = target.closest("[data-product-id]");
      const productId = Number(tile?.getAttribute("data-product-id"));
      if (!Number.isFinite(productId) || productId <= 0) return;

      sent.current = true;
      const body = JSON.stringify({ id: searchLogId, productId });
      try {
        if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
          navigator.sendBeacon("/api/search-log/click", body);
        } else {
          void fetch("/api/search-log/click", { method: "POST", body, keepalive: true });
        }
      } catch {
        /* a result click must never fail because it was being counted */
      }
    }

    el.addEventListener("click", onClick, true);
    return () => el.removeEventListener("click", onClick, true);
  }, [searchLogId]);

  return <div ref={containerRef}>{children}</div>;
}
