"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Thin client wrapper that owns the only two interactive bits of the mega menu.
 *
 * 1. SUPPRESSION. The panels open on pure-CSS :hover/:focus-within, but after a
 *    soft (SPA) navigation the header stays mounted with the cursor still over
 *    the bar, so a panel would otherwise stay open. On any link click we set
 *    `data-suppressed`, which force-hides every `.mega-panel` descendant
 *    (overriding hover) until the pointer leaves the bar — and collapses it to
 *    zero height with it, so a suppressed panel adds no page height either
 *    (card Qt0yPLCl).
 *
 * 2. OVERFLOW. The bar must stay ONE row (card 9wau4Tx9): departments that do
 *    not fit tuck under a "More" item at the end. Only the browser knows how
 *    wide a label renders, so the server draws every department plus a hidden
 *    "More" entry carrying the same list, and this measures which ones fit and
 *    hides the rest. Re-measured on resize and once web fonts have settled.
 *
 * Keeping this isolated lets MegaMenu stay a server component.
 */
export function MegaMenuShell({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const [suppressed, setSuppressed] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  const layout = useCallback(() => {
    const nav = navRef.current;
    const bar = nav?.querySelector<HTMLElement>("[data-nav-bar]");
    if (!nav || !bar) return;
    const items = Array.from(bar.querySelectorAll<HTMLElement>(":scope > [data-nav-item]"));
    const rights = Array.from(bar.querySelectorAll<HTMLElement>(":scope > [data-nav-right]"));
    const more = bar.querySelector<HTMLElement>("[data-nav-more]");
    if (items.length === 0) return;

    // Measure everything at its natural width. The bar clips while we do it —
    // it also ships clipped, so an un-hydrated page can never spill a 13-item
    // row across the viewport — and goes back to `visible` once the overflow is
    // put away, because a drop-down anchored to one of these items would be cut
    // off by its own bar otherwise.
    bar.style.overflow = "hidden";
    for (const li of items) li.style.display = "";
    if (more) more.style.display = "";
    const moreWidth = more ? more.offsetWidth : 0;
    const rightWidth = rights.reduce((w, li) => w + li.offsetWidth, 0);
    const widths = items.map((li) => li.offsetWidth);
    const room = bar.clientWidth - rightWidth;

    let firstHidden = -1;
    if (widths.reduce((a, b) => a + b, 0) > room) {
      const budget = room - moreWidth;
      let used = 0;
      for (let i = 0; i < widths.length; i++) {
        used += widths[i];
        if (used > budget) {
          firstHidden = Math.max(1, i); // never empty the bar
          break;
        }
      }
    }

    items.forEach((li, i) => {
      li.style.display = firstHidden >= 0 && i >= firstHidden ? "none" : "";
    });
    if (more) more.style.display = firstHidden < 0 ? "none" : "";
    for (const entry of nav.querySelectorAll<HTMLElement>("[data-more-index]")) {
      const i = Number(entry.dataset.moreIndex);
      entry.style.display = firstHidden >= 0 && i >= firstHidden ? "" : "none";
    }
    bar.style.overflow = "visible";
  }, []);

  useEffect(() => {
    layout();
    const onResize = () => layout();
    window.addEventListener("resize", onResize);
    const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
    fonts?.ready.then(() => layout()).catch(() => {});
    return () => window.removeEventListener("resize", onResize);
  }, [layout]);

  return (
    <nav
      ref={navRef}
      aria-label="Departments"
      data-suppressed={suppressed || undefined}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a")) {
          setSuppressed(true);
          (document.activeElement as HTMLElement | null)?.blur();
        }
      }}
      onMouseLeave={() => setSuppressed(false)}
      className={`${className} [&[data-suppressed]_.mega-panel]:!invisible [&[data-suppressed]_.mega-panel]:!h-0 [&[data-suppressed]_.mega-panel]:!opacity-0`}
    >
      {children}
    </nav>
  );
}
