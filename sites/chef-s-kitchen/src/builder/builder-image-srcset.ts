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
