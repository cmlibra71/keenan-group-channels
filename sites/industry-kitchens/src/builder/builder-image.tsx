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

export default function BuilderImage(props: Record<string, unknown>) {
  const { src, alt, width, height, fill, sizes, quality, priority, loading, ...rest } = props;

  // Authored dimensions (or fill) — next/image handles it, exactly as before.
  if (fill || (width != null && height != null)) {
    return (
      <Image
        {...(rest as Record<string, unknown>)}
        src={src as string}
        alt={(alt as string) ?? ""}
        {...(fill
          ? { fill: true as const }
          : { width: Number(width), height: Number(height) })}
        {...(sizes ? { sizes: sizes as string } : {})}
        {...(quality ? { quality: Number(quality) } : {})}
        {...(priority ? { priority: true as const } : { loading: (loading as "lazy" | "eager") ?? "lazy" })}
      />
    );
  }

  const url = String(src ?? "");
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
      // next/image's own transparent-text guard: no alt flash before the bytes land.
      style={{ color: "transparent", ...(style ?? {}) }}
      src={responsive.src}
      {...(responsive.srcSet
        ? { srcSet: responsive.srcSet, sizes: (sizes as string) ?? "100vw" }
        : {})}
      alt={(alt as string) ?? ""}
      loading={priority ? "eager" : ((loading as "lazy" | "eager") ?? "lazy")}
      decoding="async"
    />
  );
}
