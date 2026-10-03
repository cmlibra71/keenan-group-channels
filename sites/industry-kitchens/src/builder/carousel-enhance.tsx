"use client";
import * as React from "react";
import { autoplayMs, nearestIndex, stepIndex } from "./carousel-state";

// ============================================================================
// Carousel behaviour for authored node trees (WP3 K1). The markup is ordinary
// nodes (the kit's info-carousel master); this wires it up after hydration:
//   [data-kg-carousel]            root; data-autoplay="<ms>" (empty = off),
//                                 data-loop="false" to stop at the ends
//   [data-kg-carousel-track]      the horizontal scroller — its children are
//                                 the slides (CSS scroll-snap gives swipe)
//   [data-kg-carousel-prev|next]  buttons (their text is a CMS prop)
//   [data-kg-carousel-dot]        one button per slide, in order; the current
//                                 one carries aria-current="true" + data-current
// Arrow keys move while focus is inside. Autoplay pauses on hover/focus and in
// a hidden tab, and never runs under prefers-reduced-motion or when frozen for
// screenshot diffing (?kg-freeze, <html data-kg-freeze>, or localStorage
// kg-freeze=1) — frozen carousels stay on slide 1. Site opt-in
// (site-render-policy carousels).
// ============================================================================

function frozen(): boolean {
  try {
    if (new URLSearchParams(window.location.search).has("kg-freeze")) return true;
    if (document.documentElement.hasAttribute("data-kg-freeze")) return true;
    return window.localStorage.getItem("kg-freeze") === "1";
  } catch {
    return false;
  }
}

function wire(root: HTMLElement, reduced: boolean, freeze: boolean): () => void {
  const track = root.querySelector<HTMLElement>("[data-kg-carousel-track]");
  if (!track) return () => {};
  const slides = () => Array.from(track.children) as HTMLElement[];
  const dots = Array.from(root.querySelectorAll<HTMLElement>("[data-kg-carousel-dot]"));
  const loop = root.getAttribute("data-loop") !== "false";
  const offsets = () => {
    const base = track.getBoundingClientRect().left - track.scrollLeft;
    return slides().map((s) => s.getBoundingClientRect().left - base);
  };
  const current = () => nearestIndex(offsets(), track.scrollLeft);
  const go = (i: number) => {
    const o = offsets();
    if (!o.length) return;
    const left = Math.min(o[Math.max(0, Math.min(o.length - 1, i))], track.scrollWidth - track.clientWidth);
    track.scrollTo({ left, behavior: reduced ? "auto" : "smooth" });
  };
  const step = (dir: 1 | -1) => {
    const n = slides().length;
    const max = track.scrollWidth - track.clientWidth;
    // At the far end with several slides per view, "next" wraps to the start.
    if (dir === 1 && loop && track.scrollLeft >= max - 1) return go(0);
    go(stepIndex(current(), n, dir, loop));
  };
  const mark = () => {
    const i = current();
    dots.forEach((d, k) => {
      // aria-current for assistive tech; data-current for styling (class tokens cannot carry "=")
      if (k === i) {
        d.setAttribute("aria-current", "true");
        d.setAttribute("data-current", "");
      } else {
        d.removeAttribute("aria-current");
        d.removeAttribute("data-current");
      }
    });
  };

  const prev = root.querySelectorAll<HTMLElement>("[data-kg-carousel-prev]");
  const next = root.querySelectorAll<HTMLElement>("[data-kg-carousel-next]");
  const onPrev = (e: Event) => (e.preventDefault(), step(-1));
  const onNext = (e: Event) => (e.preventDefault(), step(1));
  prev.forEach((b) => b.addEventListener("click", onPrev));
  next.forEach((b) => b.addEventListener("click", onNext));
  const dotHandlers = dots.map((d, k) => {
    const h = (e: Event) => (e.preventDefault(), go(k));
    d.addEventListener("click", h);
    return h;
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") (e.preventDefault(), step(1));
    else if (e.key === "ArrowLeft") (e.preventDefault(), step(-1));
  };
  root.addEventListener("keydown", onKey);
  let raf = 0;
  const onScroll = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(mark);
  };
  track.addEventListener("scroll", onScroll, { passive: true });
  mark();

  const ms = reduced || freeze ? 0 : autoplayMs(root.getAttribute("data-autoplay"));
  let timer: ReturnType<typeof setInterval> | null = null;
  let hover = false;
  let focus = false;
  const sync = () => {
    const run = ms > 0 && !hover && !focus && document.visibilityState === "visible";
    if (run && !timer) timer = setInterval(() => step(1), ms);
    if (!run && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
  const enter = () => ((hover = true), sync());
  const leave = () => ((hover = false), sync());
  const fin = () => ((focus = true), sync());
  const fout = (e: FocusEvent) => {
    if (!root.contains(e.relatedTarget as Node | null)) (focus = false), sync();
  };
  if (ms > 0) {
    root.addEventListener("mouseenter", enter);
    root.addEventListener("mouseleave", leave);
    root.addEventListener("focusin", fin);
    root.addEventListener("focusout", fout);
    document.addEventListener("visibilitychange", sync);
    sync();
  }
  return () => {
    prev.forEach((b) => b.removeEventListener("click", onPrev));
    next.forEach((b) => b.removeEventListener("click", onNext));
    dots.forEach((d, k) => d.removeEventListener("click", dotHandlers[k]));
    root.removeEventListener("keydown", onKey);
    track.removeEventListener("scroll", onScroll);
    cancelAnimationFrame(raf);
    root.removeEventListener("mouseenter", enter);
    root.removeEventListener("mouseleave", leave);
    root.removeEventListener("focusin", fin);
    root.removeEventListener("focusout", fout);
    document.removeEventListener("visibilitychange", sync);
    if (timer) clearInterval(timer);
  };
}

/** Wire every authored carousel under `scope`; returns the teardown. */
export function wireCarousels(scope: ParentNode = document): () => void {
  const reduced = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const freeze = frozen();
  const cleanups = Array.from(scope.querySelectorAll<HTMLElement>("[data-kg-nodes] [data-kg-carousel]")).map((r) =>
    wire(r, reduced, freeze)
  );
  return () => cleanups.forEach((c) => c());
}

export function CarouselEnhance() {
  React.useEffect(() => (typeof window === "undefined" ? undefined : wireCarousels()), []);
  return null;
}
