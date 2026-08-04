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

export function ProductImageGallery({
  images,
  productName,
  variantImageUrl,
  videos = [],
}: {
  images: ProductImage[];
  productName: string;
  variantImageUrl?: string | null;
  /** Product videos — shown after the image thumbnails, played in place. */
  videos?: FacadeVideo[];
}) {
  // Build effective image list: prepend variant image if available
  const effectiveImages = useMemo(() => {
    if (!variantImageUrl) return images;
    const variantImage: ProductImage = {
      id: -1,
      urlStandard: variantImageUrl,
      urlThumbnail: variantImageUrl,
      urlZoom: variantImageUrl,
      altText: productName,
      isThumbnail: null,
    };
    return [variantImage, ...images];
  }, [images, variantImageUrl, productName]);

  const [selectedIndex, setSelectedIndex] = useState(() => {
    const thumbIdx = images.findIndex((img) => img.isThumbnail);
    return thumbIdx >= 0 ? thumbIdx : 0;
  });
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
    return (
      <div className="h-80 overflow-hidden rounded-lg bg-zinc-100">
        <div className="h-full w-full flex items-center justify-center text-zinc-300">
          <Package className="h-24 w-24" />
        </div>
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
        <div className="relative w-full overflow-hidden rounded-lg bg-black aspect-video max-h-[600px]">
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
          className={`relative overflow-hidden rounded-lg flex items-center justify-center max-h-[600px] ${
            isZooming ? "cursor-zoom-out" : "cursor-zoom-in"
          }`}
          onClick={handleClick}
          onMouseMove={isZooming ? handleMouseMove : undefined}
          onMouseLeave={() => setIsZooming(false)}
        >
          <Image
            src={selected.urlStandard}
            alt={selected.altText || productName}
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
        <p className="mt-2 text-xs text-zinc-400 text-center hidden sm:block">Click to zoom</p>
      )}

      {/* Thumbnail strip — images first, then videos */}
      {effectiveImages.length + videos.length > 1 && (
        <div className="mt-4 flex gap-2 overflow-x-auto">
          {effectiveImages.map((img, idx) => (
            <button
              key={img.id === -1 ? "variant" : img.id}
              onClick={() => showImage(idx)}
              className={`relative flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 overflow-hidden rounded bg-zinc-100 cursor-pointer transition-all ${
                idx === selectedIndex && !playing
                  ? "ring-2 ring-zinc-900 ring-offset-1"
                  : "hover:ring-2 hover:ring-zinc-300"
              }`}
            >
              <Image
                src={img.urlThumbnail || img.urlStandard}
                alt={img.altText || productName}
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
              className={`relative flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 overflow-hidden rounded bg-black cursor-pointer transition-all ${
                playing?.id === video.id
                  ? "ring-2 ring-zinc-900 ring-offset-1"
                  : "hover:ring-2 hover:ring-zinc-300"
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
                <Play className="h-6 w-6 fill-current" />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
