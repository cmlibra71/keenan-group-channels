"use client";
import * as React from "react";
import { autoplayMs, currentDot, nearestIndex, stepIndex } from "./carousel-state";

// ============================================================================
// Carousel behaviour for authored node trees (WP3 K1). The markup is ordinary
// nodes (the kit's carousel pattern); this wires it up after hydration:
//   [data-kg-carousel]            root; data-autoplay="<ms>" (empty = off),
//                                 data-loop="false" to stop at the ends
//   [data-kg-carousel-track]      the horizontal scroller — its children are
//                                 the slides (CSS scroll-snap gives swipe)
//   [data-kg-carousel-prev|next]  buttons (their text is a CMS prop)
//   [data-kg-carousel-dot]        one button per slide, in order; the current
//                                 one carries aria-current="true" + data-current
//   [data-kg-carousel-pause]      a visible pause/play toggle (WCAG 2.2.2,
//                                 coordinator 2026-10-04): the root gets
//                                 data-paused while the visitor has paused it;
//                                 its accessible name swaps between the
//                                 button's data-label-pause / data-label-play
// Navigation counts in SLIDES (Zoey's slick, infinite mode): with several
// slides in view the track stops at its end but the index keeps going, so
// every dot is reachable. A track that cannot scroll at all hides its arrows
// and dots and never autoplays. Arrow keys move while focus is inside.
// Autoplay pauses on hover/focus and in a hidden tab, and never runs under
// prefers-reduced-motion or when frozen for screenshot diffing (?kg-freeze,
// <html data-kg-freeze>, or localStorage kg-freeze=1) — frozen carousels stay
// on slide 1. Site opt-in (site-render-policy carousels).
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
  // Only this carousel's own parts (a carousel nested in a slide keeps its own).
  const own = <T extends HTMLElement>(sel: string) =>
    Array.from(root.querySelectorAll<T>(sel)).filter((el) => el.closest("[data-kg-carousel]") === root);
  const track = own<HTMLElement>("[data-kg-carousel-track]")[0];
  if (!track) return () => {};
  const slides = () => Array.from(track.children) as HTMLElement[];
  const dots = own<HTMLElement>("[data-kg-carousel-dot]");
  const prev = own<HTMLElement>("[data-kg-carousel-prev]");
  const next = own<HTMLElement>("[data-kg-carousel-next]");
  const pauses = own<HTMLElement>("[data-kg-carousel-pause]");
  const loop = root.getAttribute("data-loop") !== "false";
  const maxScroll = () => Math.max(0, track.scrollWidth - track.clientWidth);
  const offsets = () => {
    const base = track.getBoundingClientRect().left - track.scrollLeft;
    return slides().map((s) => s.getBoundingClientRect().left - base);
  };
  let want = 0; // the slide navigation is on (may sit past the track's end)
  let targetLeft: number | null = null;

  const mark = () => {
    // While our own scroll is under way the target slide stays lit (no flicker through the ones between).
    const i =
      targetLeft !== null ? want : currentDot(want, nearestIndex(offsets(), track.scrollLeft), track.scrollLeft >= maxScroll() - 1);
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
  const go = (i: number) => {
    const o = offsets();
    if (!o.length) return;
    want = Math.max(0, Math.min(o.length - 1, i));
    targetLeft = Math.min(o[want], maxScroll());
    // Already there (e.g. stepping past the track's end): no scroll event will come to clear it.
    if (Math.abs(track.scrollLeft - targetLeft) <= 2) targetLeft = null;
    else track.scrollTo({ left: targetLeft, behavior: reduced ? "auto" : "smooth" });
    mark();
  };
  const step = (dir: 1 | -1) => go(stepIndex(want, slides().length, dir, loop));

  // A track with nothing to scroll has nothing to navigate: no controls, no autoplay.
  let isStatic = false;
  const layout = () => {
    isStatic = maxScroll() <= 1 || slides().length <= 1;
    for (const el of [...prev, ...next, ...dots]) el.style.display = isStatic ? "none" : "";
    // Nothing moves on its own (no autoplay, reduced motion, frozen, static): nothing to pause.
    for (const el of pauses) el.style.display = isStatic || ms === 0 ? "none" : "";
    if (isStatic) want = 0;
    // Widened so the track is no longer at its end: the index follows what is shown.
    else if (targetLeft === null && track.scrollLeft < maxScroll() - 1) want = nearestIndex(offsets(), track.scrollLeft);
    mark();
    sync();
  };

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
    if (isStatic) return;
    if (e.key === "ArrowRight") (e.preventDefault(), step(1));
    else if (e.key === "ArrowLeft") (e.preventDefault(), step(-1));
  };
  root.addEventListener("keydown", onKey);
  let raf = 0;
  let settle: ReturnType<typeof setTimeout> | null = null;
  const onScroll = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(mark);
    if (settle) clearTimeout(settle);
    settle = setTimeout(() => {
      // A swipe (not our own scrollTo) moves the index to where the track came to rest.
      if (targetLeft !== null && Math.abs(track.scrollLeft - targetLeft) <= 2) {
        targetLeft = null; // our scroll arrived
        mark();
      } else {
        const atEnd = track.scrollLeft >= maxScroll() - 1;
        const near = nearestIndex(offsets(), track.scrollLeft);
        want = atEnd && want > near ? want : near;
        targetLeft = null;
        mark();
      }
    }, 150);
  };
  track.addEventListener("scroll", onScroll, { passive: true });

  const ms = reduced || freeze ? 0 : autoplayMs(root.getAttribute("data-autoplay"));
  let timer: ReturnType<typeof setInterval> | null = null;
  let hover = false;
  let focus = false;
  let userPaused = false;
  const showPaused = () => {
    root.toggleAttribute("data-paused", userPaused);
    // The accessible NAME says what the button will do ("Pause" / "Play"); no aria-pressed on top
    // of a swapping label (it would announce "Play, pressed").
    for (const b of pauses) {
      const label = b.getAttribute(userPaused ? "data-label-play" : "data-label-pause");
      if (label) b.setAttribute("aria-label", label);
    }
  };
  const onPause = (e: Event) => {
    e.preventDefault();
    userPaused = !userPaused;
    showPaused();
    sync();
  };
  pauses.forEach((b) => b.addEventListener("click", onPause));
  function sync() {
    const run = ms > 0 && !isStatic && !userPaused && !hover && !focus && document.visibilityState === "visible";
    if (run && !timer) timer = setInterval(() => step(1), ms);
    if (!run && timer) {
      clearInterval(timer);
      timer = null;
    }
  }
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
  }
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => layout()) : null;
  ro?.observe(track);
  layout();

  return () => {
    prev.forEach((b) => b.removeEventListener("click", onPrev));
    next.forEach((b) => b.removeEventListener("click", onNext));
    dots.forEach((d, k) => d.removeEventListener("click", dotHandlers[k]));
    pauses.forEach((b) => b.removeEventListener("click", onPause));
    root.removeEventListener("keydown", onKey);
    track.removeEventListener("scroll", onScroll);
    cancelAnimationFrame(raf);
    if (settle) clearTimeout(settle);
    root.removeEventListener("mouseenter", enter);
    root.removeEventListener("mouseleave", leave);
    root.removeEventListener("focusin", fin);
    root.removeEventListener("focusout", fout);
    document.removeEventListener("visibilitychange", sync);
    ro?.disconnect();
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
