"use client";

import { useState, useRef, useCallback } from "react";
import Image from "next/image";
import { Package } from "lucide-react";
import imageLoader from "@/lib/image-loader";

interface ProductImage {
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
}: {
  images: ProductImage[];
  productName: string;
}) {
  // Filter out thumbnail-only images from the gallery
  const galleryImages = images.filter((img) => !img.isThumbnail);
  const displayImages = galleryImages.length > 0 ? galleryImages : images;

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isZooming, setIsZooming] = useState(false);
  const zoomRef = useRef<HTMLDivElement>(null);

  const selected = displayImages[selectedIndex];

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
      // Enter zoom — position zoom at click point immediately
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

  if (images.length === 0) {
    return (
      <div className="aspect-square overflow-hidden rounded-lg bg-zinc-100">
        <div className="h-full w-full flex items-center justify-center text-zinc-300">
          <Package className="h-24 w-24" />
        </div>
      </div>
    );
  }

  // Use loader to get optimized zoom URL (large size for zoom)
  const zoomSrc = selected.urlZoom || selected.urlStandard;
  const zoomUrl = imageLoader({ src: zoomSrc, width: 1920, quality: 90 });

  return (
    <div>
      {/* Main image with click-to-zoom */}
      <div
        className={`relative aspect-square overflow-hidden rounded-lg bg-zinc-100 ${
          isZooming ? "cursor-zoom-out" : "cursor-zoom-in"
        }`}
        onClick={handleClick}
        onMouseMove={isZooming ? handleMouseMove : undefined}
        onMouseLeave={() => setIsZooming(false)}
      >
        <Image
          src={selected.urlStandard}
          alt={selected.altText || productName}
          fill
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="object-contain select-none"
          draggable={false}
          priority
        />
        {/* Zoom overlay — bg loads lazily; standard img shows through until ready */}
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

      <p className="mt-2 text-xs text-zinc-400 text-center hidden sm:block">Click to zoom</p>

      {/* Thumbnail strip */}
      {displayImages.length > 1 && (
        <div className="mt-4 flex gap-2 overflow-x-auto">
          {displayImages.map((img, idx) => (
            <button
              key={img.id}
              onClick={() => setSelectedIndex(idx)}
              className={`relative flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 overflow-hidden rounded bg-zinc-100 cursor-pointer transition-all ${
                idx === selectedIndex
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
        </div>
      )}
    </div>
  );
}
