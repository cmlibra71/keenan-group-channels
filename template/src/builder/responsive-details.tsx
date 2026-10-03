"use client";
import * as React from "react";
import { detailsOpenFor } from "./responsive-details-state";

// ============================================================================
// Responsive accordion open state (WP2-n). An FAQ <details> authored with
// data-open-base / data-open-lg ("open" or "") is rendered by the server in its
// desktop (lg) state; below 1024 px this applies the base value on load and
// whenever the breakpoint is crossed — but never undoes a visitor's own click
// on that item. data-open-xl (optional) is the state from 1280 px, for items
// Zoey opened only on wide screens. Site opt-in (site-render-policy
// responsiveDetails).
// ============================================================================

const LG = "(min-width: 1024px)";
const XL = "(min-width: 1280px)";

export function ResponsiveDetails() {
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(LG);
    const mqXl = window.matchMedia(XL);
    // A visitor's own open/close is a click on the item's <summary> (keyboard
    // activation dispatches click too). `toggle` cannot be used: browsers fire
    // it for any details parsed with `open`, so every item would look touched.
    const touched = new WeakSet<HTMLDetailsElement>();
    const items = () =>
      Array.from(document.querySelectorAll<HTMLDetailsElement>("[data-kg-nodes] details[data-open-base], [data-kg-nodes] details[data-open-lg], [data-kg-nodes] details[data-open-xl]"));
    const apply = () => {
      for (const d of items()) {
        if (touched.has(d)) continue;
        const want = detailsOpenFor(
          d.getAttribute("data-open-base"),
          d.getAttribute("data-open-lg"),
          mq.matches,
          d.open,
          d.getAttribute("data-open-xl"),
          mqXl.matches
        );
        if (d.open !== want) d.open = want;
      }
    };
    const onClick = (e: Event) => {
      const summary = (e.target as Element | null)?.closest?.("summary");
      const d = summary?.parentElement;
      if (d && d.tagName === "DETAILS") touched.add(d as HTMLDetailsElement);
    };
    document.addEventListener("click", onClick, true);
    apply();
    mq.addEventListener("change", apply);
    mqXl.addEventListener("change", apply);
    return () => {
      document.removeEventListener("click", onClick, true);
      mq.removeEventListener("change", apply);
      mqXl.removeEventListener("change", apply);
    };
  }, []);
  return null;
}
