/** The open state an accordion item should have at this width (pure). An
 *  attribute that is absent keeps the item as it is — except from 1280 px
 *  (`xl`), where an item with no data-open-xl follows its data-open-lg. */
export function detailsOpenFor(
  base: string | null,
  lg: string | null,
  isLg: boolean,
  current: boolean,
  xl: string | null = null,
  isXl = false
): boolean {
  const v = isXl && xl !== null ? xl : isLg || isXl ? lg : base;
  if (v === null) return current;
  return v === "open" || v === "true";
}

/**
 * A data-driven breakpoint list (`data-open-at`), for collapse points the fixed lg/xl attributes
 * cannot express (Zoey's customer-service FAQ collapses below 900px): comma-separated
 * `<minWidth>:<open|closed>` pairs, e.g. "0:closed,900:open". Malformed pairs are ignored; widths
 * are clamped to 0–10000; at most 8 pairs. Returns the sorted pairs (empty = attribute unusable).
 */
export function parseOpenAt(raw: string | null): { min: number; open: boolean }[] {
  if (!raw) return [];
  const out: { min: number; open: boolean }[] = [];
  for (const part of raw.split(",").slice(0, 8)) {
    const m = /^\s*(\d{1,5})\s*:\s*(open|closed|true|false)\s*$/i.exec(part);
    if (!m) continue;
    const min = Math.min(10000, Number(m[1]));
    const open = /^(open|true)$/i.test(m[2]);
    const i = out.findIndex((x) => x.min === min);
    if (i >= 0) out[i] = { min, open };
    else out.push({ min, open });
  }
  return out.sort((a, b) => a.min - b.min);
}

/** The state for `width` from a parsed list: the pair with the largest min ≤ width; none applies
 *  (width below every min) → unchanged. data-open-at, when usable, wins over base/lg/xl. */
export function openAtFor(pairs: { min: number; open: boolean }[], width: number, current: boolean): boolean {
  let v: boolean | null = null;
  for (const p of pairs) if (p.min <= width) v = p.open;
  return v === null ? current : v;
}
