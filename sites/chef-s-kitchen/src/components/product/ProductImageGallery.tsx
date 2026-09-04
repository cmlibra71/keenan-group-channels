"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import Image from "next/image";
import { Package, Play } from "lucide-react";
import type { FacadeVideo } from "@keenan/services/product-page";
import imageLoader from "@/lib/image-loader";

export interface ProductImage {
  id: number;
  urlStandard: string;
  urlThumbnail: string | null;
  urlZoom: string | null;
  altText: string | null;
  isThumbnail: boolean | null;
}

/** Stable identity for a gallery image — the variant stand-in has no real id. */
function imageKey(img: ProductImage): string {
  return img.id === -1 ? `variant:${img.urlStandard}` : `img:${img.id}`;
}

export function ProductImageGallery({
  images,
  productName,
  variantImageUrl,
  videos = [],
  brandLogoUrl = null,
  brandName = null,
}: {
  images: ProductImage[];
  productName: string;
  variantImageUrl?: string | null;
  /** Product videos — shown after the image thumbnails, played in place. */
  videos?: FacadeVideo[];
  /**
   * Card tSrCcnvx: a product with no image — or whose image FILE is broken —
   * shows its BRAND's logo instead of the grey package box. Null when the
   * product has no brand, or the brand has no usable logo, and then the grey
   * box stays exactly as it was.
   */
  brandLogoUrl?: string | null;
  /** The brand's name: the fallback image's ALT text. */
  brandName?: string | null;
}) {
  /**
   * Images whose FILE turned out not to be there. Half of what the card asks
   * for is BROKEN images, and a dead file is invisible to the server — the row
   * exists, the URL is well formed, and only the browser finds out. An image
   * that errors is dropped from the list, so a product whose every picture is
   * broken falls through to the same empty state an imageless product hits and
   * gets the same brand logo, instead of the browser's broken-image glyph.
   */
  const [brokenKeys, setBrokenKeys] = useState<Set<string>>(() => new Set());
  const markBroken = useCallback((key: string) => {
    setBrokenKeys((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }, []);
  /** The logo file can be missing too; then there is nothing left but the grey box. */
  const [brandLogoBroken, setBrandLogoBroken] = useState(false);
  const logoUrl = brandLogoBroken ? null : brandLogoUrl;

  // Build effective image list: prepend variant image if available
  const effectiveImages = useMemo(() => {
    const withVariant: ProductImage[] = !variantImageUrl
      ? images
      : [
          {
            id: -1,
            urlStandard: variantImageUrl,
            urlThumbnail: variantImageUrl,
            urlZoom: variantImageUrl,
            altText: productName,
            isThumbnail: null,
          },
          ...images,
        ];
    if (brokenKeys.size === 0) return withVariant;
    return withVariant.filter((img) => !brokenKeys.has(imageKey(img)));
  }, [images, variantImageUrl, productName, brokenKeys]);

  // The chosen variation's photograph IS the displayed image, not merely an
  // extra thumbnail: it sits at index 0 of `effectiveImages` and index 0 is
  // what opens. Derived in the initialiser as well as in the effect below so a
  // gallery that MOUNTS with a variation already chosen opens on that
  // variation's picture, rather than painting the product thumbnail first and
  // correcting itself a frame later. (Card 0CDcCYmO.)
  const [rawSelectedIndex, setSelectedIndex] = useState(() => {
    if (variantImageUrl) return 0;
    const thumbIdx = images.findIndex((img) => img.isThumbnail);
    return thumbIdx >= 0 ? thumbIdx : 0;
  });
  // Dropping a broken image shortens the list under the selection, so the index
  // is clamped on READ rather than chased with a second effect — the selection
  // the shopper made is preserved, it just cannot point past the end.
  const selectedIndex =
    effectiveImages.length === 0 ? 0 : Math.min(rawSelectedIndex, effectiveImages.length - 1);
  const [isZooming, setIsZooming] = useState(false);
  // Which video (if any) has taken over the main viewport. Null = showing an image.
  const [playingVideoId, setPlayingVideoId] = useState<number | null>(null);
  const zoomRef = useRef<HTMLDivElement>(null);

  // When variant image changes, jump to it (index 0) or reset to thumbnail
  useEffect(() => {
    if (variantImageUrl) {
      setSelectedIndex(0);
    } else {
      const thumbIdx = images.findIndex((img) => img.isThumbnail);
      setSelectedIndex(thumbIdx >= 0 ? thumbIdx : 0);
    }
    setIsZooming(false);
    setPlayingVideoId(null);
  }, [variantImageUrl, images]);

  const selected = effectiveImages[selectedIndex];
  // A product with videos but no images opens on its first video rather than
  // the empty-state placeholder.
  const playing =
    videos.find((v) => v.id === playingVideoId) ??
    (effectiveImages.length === 0 ? (videos[0] ?? null) : null);

  function showImage(idx: number) {
    setSelectedIndex(idx);
    setPlayingVideoId(null);
  }

  function playVideo(id: number) {
    setPlayingVideoId(id);
    setIsZooming(false);
  }

  // Direct DOM update for 60fps — no React re-renders on mousemove
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!zoomRef.current) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      zoomRef.current.style.backgroundPosition = `${x}% ${y}%`;
    },
    []
  );

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!isZooming) {
      setIsZooming(true);
      if (zoomRef.current) {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        zoomRef.current.style.backgroundPosition = `${x}% ${y}%`;
      }
    } else {
      setIsZooming(false);
    }
  }

  if (effectiveImages.length === 0 && videos.length === 0) {
    // Card tSrCcnvx: the brand's logo stands in for the missing photo. Contained
    // and padded, never `object-cover` — brand logos are normalised to 600x300,
    // and cropping one to fill the stage makes it unreadable. No usable logo
    // (no brand, or a brand carrying none) keeps the grey box that shipped
    // before.
    return (
      <div className="h-80 overflow-hidden bg-surface-secondary">
        {logoUrl ? (
          <div className="h-full w-full flex items-center justify-center p-10">
            <Image
              src={logoUrl}
              alt={brandName || productName}
              width={600}
              height={300}
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="max-h-full w-auto max-w-full object-contain"
              onError={() => setBrandLogoBroken(true)}
            />
          </div>
        ) : (
          <div className="h-full w-full flex items-center justify-center text-text-muted">
            <Package className="h-24 w-24" strokeWidth={1.5} />
          </div>
        )}
      </div>
    );
  }

  // Use loader to get optimized zoom URL (large size for zoom)
  const zoomSrc = selected ? selected.urlZoom || selected.urlStandard : null;
  const zoomUrl = zoomSrc ? imageLoader({ src: zoomSrc, width: 1920, quality: 90 }) : null;

  return (
    <div>
      {playing ? (
        /* Video takes over the main viewport — same footprint as the image */
        <div className="relative w-full overflow-hidden bg-black aspect-video max-h-[600px]">
          <iframe
            key={playing.id}
            src={playing.embedUrl}
            title={playing.title || `${productName} video`}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      ) : (
        /* Main image with click-to-zoom */
        <div
          className={`relative overflow-hidden flex items-center justify-center max-h-[600px] ${
            isZooming ? "cursor-zoom-out" : "cursor-zoom-in"
          }`}
          onClick={handleClick}
          onMouseMove={isZooming ? handleMouseMove : undefined}
          onMouseLeave={() => setIsZooming(false)}
        >
          <Image
            key={imageKey(selected)}
            src={selected.urlStandard}
            alt={selected.altText || productName}
            onError={() => markBroken(imageKey(selected))}
            width={800}
            height={800}
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="w-full h-auto max-h-[600px] object-contain select-none"
            draggable={false}
            priority
          />
          {/* Zoom overlay */}
          <div
            ref={zoomRef}
            className={`absolute inset-0 pointer-events-none transition-opacity duration-200 ${
              isZooming ? "opacity-100" : "opacity-0"
            }`}
            style={{
              backgroundImage: `url(${zoomUrl})`,
              backgroundSize: "250%",
              backgroundPosition: "50% 50%",
              backgroundRepeat: "no-repeat",
            }}
          />
        </div>
      )}

      {!playing && (
        <p className="mt-2 text-xs text-text-muted text-center hidden sm:block">Click to zoom</p>
      )}

      {/* Thumbnail strip — images first, then videos */}
      {effectiveImages.length + videos.length > 1 && (
        <div className="mt-4 flex gap-2 overflow-x-auto">
          {effectiveImages.map((img, idx) => (
            <button
              key={img.id === -1 ? "variant" : img.id}
              onClick={() => showImage(idx)}
              className={`relative flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 overflow-hidden bg-surface-secondary cursor-pointer transition-all ${
                idx === selectedIndex && !playing
                  ? "ring-2 ring-text-primary ring-offset-1"
                  : "hover:ring-2 hover:ring-text-muted"
              }`}
            >
              <Image
                src={img.urlThumbnail || img.urlStandard}
                alt={img.altText || productName}
                onError={() => markBroken(imageKey(img))}
                fill
                sizes="80px"
                className="object-contain"
                draggable={false}
              />
            </button>
          ))}
          {videos.map((video) => (
            <button
              key={`video-${video.id}`}
              onClick={() => playVideo(video.id)}
              title={video.title || "Play video"}
              aria-label={video.title || `Play ${productName} video`}
              className={`relative flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 overflow-hidden bg-black cursor-pointer transition-all ${
                playing?.id === video.id
                  ? "ring-2 ring-text-primary ring-offset-1"
                  : "hover:ring-2 hover:ring-text-muted"
              }`}
            >
              {video.thumbnailUrl && (
                // Poster comes from the video host, so it bypasses the S3-only
                // image proxy (which would 403 it).
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={video.thumbnailUrl}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover opacity-80"
                />
              )}
              <span className="absolute inset-0 flex items-center justify-center text-white">
                <Play className="h-6 w-6 fill-current" strokeWidth={1.5} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
