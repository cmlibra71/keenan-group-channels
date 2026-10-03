// Pure seam behind <BuilderImage>: the responsive attributes for an authored
// builder <img> node that declared no dimensions. next/image would normally
// compute these, but it refuses to run at all without a width, so we compute
// them ourselves — which is the whole point, the custom loader is never called
// without an explicit width.

export type ImageLoaderFn = (args: { src: string; width: number; quality?: number }) => string;

export type ResponsiveImageAttrs = {
  /** Largest candidate — what a browser without srcset support loads. */
  src: string;
  /** Omitted when the loader ignores width (relative paths, data: URLs). */
  srcSet?: string;
};

/** Builds `src` + `srcSet` from `widths`, calling `loader` once per width. */
export function responsiveImageAttrs(
  src: string,
  widths: number[],
  loader: ImageLoaderFn,
  quality?: number
): ResponsiveImageAttrs {
  const candidates = widths.map((width) => loader({ src, width, quality }));
  const largest = candidates[candidates.length - 1];
  // One distinct URL means the loader ignored the width — a srcset of identical
  // candidates only costs the browser a parse, so drop it.
  if (new Set(candidates).size <= 1) return { src: largest };
  return {
    src: largest,
    srcSet: widths.map((w, i) => `${candidates[i]} ${w}w`).join(", "),
  };
}

/** The widths the image route serves (lib/image-params ALLOWED_WIDTHS — next.config imageSizes + deviceSizes). */
export const SERVED_WIDTHS = [100, 200, 400, 600, 800, 1024, 1280, 1600] as const;

/**
 * Hi-DPI attributes for an image whose display box is known (authored or registered width): a
 * 1x candidate at the box width and a 2x candidate at twice it, each snapped UP to a served width —
 * but never wider than the original file (`origWidth`, registered asset width) when known, so no
 * candidate is more than one served step above the file. One distinct URL → no srcset at all.
 */
export function hiDpiImageAttrs(
  src: string,
  boxWidth: number,
  origWidth: number | null,
  loader: ImageLoaderFn,
  quality?: number
): ResponsiveImageAttrs {
  const snap = (w: number) => SERVED_WIDTHS.find((s) => s >= w) ?? SERVED_WIDTHS[SERVED_WIDTHS.length - 1];
  const cap = (w: number) => (origWidth && origWidth > 0 ? Math.min(w, snap(origWidth)) : w);
  const one = cap(snap(Math.max(1, boxWidth)));
  const two = cap(snap(Math.max(1, boxWidth) * 2));
  const u1 = loader({ src, width: one, quality });
  const u2 = loader({ src, width: two, quality });
  if (u1 === u2) return { src: u1 };
  return { src: u1, srcSet: `${u1} 1x, ${u2} 2x` };
}
