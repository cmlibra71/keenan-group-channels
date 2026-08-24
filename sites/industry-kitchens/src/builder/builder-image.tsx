"use client";
import * as React from "react";
import Image from "next/image";
import imageLoader from "@/lib/image-loader";
import { responsiveImageAttrs } from "./builder-image-srcset";

// ============================================================================
// The <img> adapter the Site Builder render engine renders authored image nodes
// through (NodeRenderer's `imageComponent`).
//
// Authored builder nodes carry only what the designer set — in practice `src`
// and `alt`, sized entirely by CSS classes (`h-full w-full`, `w-full h-auto`).
// next/image REQUIRES intrinsic dimensions: `fill`, or both `width` and
// `height`. Without them `getImgProps` throws
//   Image with src "…" is missing required "width" property
// but only in development — the whole validation block is wrapped in
// `process.env.NODE_ENV !== "production"`. So production has always rendered
// these nodes fine while `npm run dev` 500s the page (the CD product page,
// whose related-products rail instantiates the ⬢product-card master).
//
// We cannot supply a dimension on the node's behalf: `fill` would absolutely
// position images whose parent is not positioned (the CD category template has
// two `w-full h-auto` in-flow images), and a made-up width/height would impose a
// wrong intrinsic aspect ratio. So a dimensionless node renders the markup
// next/image itself produces for one in production — a plain <img> with the
// custom loader's srcset over `images.deviceSizes` at `sizes="100vw"` — built
// here, where the loader is always handed an explicit width. Same URLs, same
// candidate widths, same lazy loading; dev simply stops throwing.
// ============================================================================

/** Mirrors `images.deviceSizes` in next.config.ts — the widths next/image
 *  offers a dimensionless image (kind "w", `sizes` defaulted to 100vw). */
const DEVICE_SIZES = [1024, 1280, 1600];

// ============================================================================
// Card tSrCcnvx — a BROKEN image file falls back, in the authored tree too.
//
// Half of what Tim asked for is images that are broken rather than absent, and
// a dead file is invisible to the server: the row exists, the URL is well
// formed, and only the browser finds out. The listing tile's photo is an
// AUTHORED node, so the swap cannot live in a React card — it lives here, the
// one adapter every authored image on this site renders through.
//
// A node opts in by carrying `data-fallback-src` (and, because the fallback is
// a different KIND of picture, `data-fallback-class` — a 600x300 brand logo
// must not inherit the photo's `object-cover`, which would crop half of it).
// Nodes without those attributes behave exactly as before.
//
// One swap only. If the fallback itself is missing the image renders nothing
// rather than the browser's broken-image glyph, leaving the stage's own grey
// background — never a worse picture than the one this card replaced.
// ============================================================================

function useImageFallback(src: unknown, fallbackSrc: unknown, fallbackClass: unknown, className: unknown) {
  const [failures, setFailures] = React.useState(0);
  const fallback = typeof fallbackSrc === "string" && fallbackSrc.trim() !== "" ? fallbackSrc : null;
  React.useEffect(() => setFailures(0), [src, fallback]);
  const onError = React.useCallback(() => setFailures((n) => n + 1), []);
  if (!fallback) return { src, className, onError: undefined, hidden: false };
  if (failures === 0) return { src, className, onError, hidden: false };
  if (failures === 1) {
    return {
      src: fallback,
      className: typeof fallbackClass === "string" && fallbackClass ? fallbackClass : className,
      onError,
      hidden: false,
    };
  }
  return { src, className, onError: undefined, hidden: true };
}

export default function BuilderImage(props: Record<string, unknown>) {
  const {
    src,
    alt,
    width,
    height,
    fill,
    sizes,
    quality,
    priority,
    loading,
    "data-fallback-src": fallbackSrc,
    "data-fallback-class": fallbackClass,
    "data-fallback-alt": fallbackAlt,
    ...rest
  } = props;
  const resolved = useImageFallback(src, fallbackSrc, fallbackClass, rest.className);
  if (resolved.hidden) return null;
  const shownSrc = resolved.src;
  const shownAlt =
    resolved.src !== src && typeof fallbackAlt === "string" && fallbackAlt ? fallbackAlt : ((alt as string) ?? "");

  // Authored dimensions (or fill) — next/image handles it, exactly as before.
  if (fill || (width != null && height != null)) {
    return (
      <Image
        {...(rest as Record<string, unknown>)}
        className={resolved.className as string | undefined}
        onError={resolved.onError}
        src={shownSrc as string}
        alt={shownAlt}
        {...(fill
          ? { fill: true as const }
          : { width: Number(width), height: Number(height) })}
        {...(sizes ? { sizes: sizes as string } : {})}
        {...(quality ? { quality: Number(quality) } : {})}
        {...(priority ? { priority: true as const } : { loading: (loading as "lazy" | "eager") ?? "lazy" })}
      />
    );
  }

  const url = String(shownSrc ?? "");
  if (!url) return null;
  const responsive = responsiveImageAttrs(
    url,
    DEVICE_SIZES,
    imageLoader,
    quality == null ? undefined : Number(quality)
  );
  const { style, ...attrs } = rest as { style?: React.CSSProperties };

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...(attrs as Record<string, unknown>)}
      className={resolved.className as string | undefined}
      onError={resolved.onError}
      // next/image's own transparent-text guard: no alt flash before the bytes land.
      style={{ color: "transparent", ...(style ?? {}) }}
      src={responsive.src}
      {...(responsive.srcSet
        ? { srcSet: responsive.srcSet, sizes: (sizes as string) ?? "100vw" }
        : {})}
      alt={shownAlt}
      loading={priority ? "eager" : ((loading as "lazy" | "eager") ?? "lazy")}
      decoding="async"
    />
  );
}
