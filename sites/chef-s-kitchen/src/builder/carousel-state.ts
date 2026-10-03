/** Pure carousel arithmetic (WP3 K1) — the enhancer in carousel-enhance.tsx drives the DOM. */

/** The slide after/before `i` among `n`; wraps when `loop`, else clamps. */
export function stepIndex(i: number, n: number, dir: 1 | -1, loop: boolean): number {
  if (n <= 0) return 0;
  const j = i + dir;
  if (loop) return ((j % n) + n) % n;
  return Math.max(0, Math.min(n - 1, j));
}

/** Which slide is current for a scroll position: the one whose left edge is nearest (with several
 *  slides per view that is the leftmost visible one, as Zoey's slick slider counted it). */
export function nearestIndex(offsets: readonly number[], scrollLeft: number): number {
  let best = 0;
  let bestD = Infinity;
  offsets.forEach((o, k) => {
    const d = Math.abs(o - scrollLeft);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  });
  return best;
}

/** Autoplay interval in ms from the authored attribute; 0 = no autoplay. */
export function autoplayMs(raw: string | null): number {
  const n = Number(raw);
  if (!raw || !Number.isFinite(n) || n <= 0) return 0;
  return Math.max(1500, Math.min(60000, Math.round(n)));
}

/**
 * The dot to light: the slide navigation is on (`want`) while the track rests at its end and
 * `want` lies past the leftmost visible slide (several slides per view — the track cannot move
 * further, but the count goes on); otherwise the slide the track actually shows.
 */
export function currentDot(want: number, nearest: number, atEnd: boolean): number {
  return atEnd && want > nearest ? want : nearest;
}
