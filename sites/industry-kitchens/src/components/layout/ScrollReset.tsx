"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { shouldResetScroll } from "@/lib/scroll-reset";

/**
 * Puts the reader at the TOP of the page they just opened (card N6U9USKo).
 *
 * Mounted once in the root layout, renders nothing. The decision — and the
 * navigations it deliberately keeps its hands off — lives in
 * `lib/scroll-reset.ts`, which is unit-tested.
 *
 * `behavior: "instant"` is load-bearing on Chefs Depot: its `globals.css` sets
 * `html { scroll-behavior: smooth }`, so a plain `scrollTo(0, 0)` would animate
 * the whole height of the page the reader is leaving.
 */
export function ScrollReset() {
  const pathname = usePathname();
  const previousPath = useRef<string | null>(null);
  const poppedPath = useRef<string | null>(null);

  useEffect(() => {
    const onPopState = () => {
      poppedPath.current = window.location.pathname;
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const reset = shouldResetScroll({
      previousPath: previousPath.current,
      nextPath: pathname,
      poppedPath: poppedPath.current,
      hash: window.location.hash,
    });
    previousPath.current = pathname;
    poppedPath.current = null;
    if (reset) window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return null;
}
