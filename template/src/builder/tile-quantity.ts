/**
 * A listing tile's quantity box value (IK parity, product cards — Zoey's category tile carries a
 * quantity box on some lists): a whole number from 1 to 10,000. Anything else — absent (every
 * master without a box), blank, or typed text — adds one, exactly as before. Pure.
 */
export function tileQuantity(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.trim()) : NaN;
  return Number.isInteger(n) && n >= 1 ? Math.min(n, 10000) : 1;
}
