"use client";

import { useState, useRef, useCallback } from "react";
import { Package } from "lucide-react";

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
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const thumbIdx = images.findIndex((img) => img.isThumbnail);
    return thumbIdx >= 0 ? thumbIdx : 0;
  });
  const [isZooming, setIsZooming] = useState(false);
  const zoomRef = useRef<HTMLDivElement>(null);

  const selected = images[selectedIndex];

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

  const zoomUrl = selected.urlZoom || selected.urlStandard;

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
        <img
          src={selected.urlStandard}
          alt={selected.altText || productName}
          className="h-full w-full object-cover select-none"
          draggable={false}
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
      {images.length > 1 && (
        <div className="mt-4 flex gap-2 overflow-x-auto">
          {images.map((img, idx) => (
            <button
              key={img.id}
              onClick={() => setSelectedIndex(idx)}
              className={`flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 overflow-hidden rounded bg-zinc-100 cursor-pointer transition-all ${
                idx === selectedIndex
                  ? "ring-2 ring-zinc-900 ring-offset-1"
                  : "hover:ring-2 hover:ring-zinc-300"
              }`}
            >
              <img
                src={img.urlThumbnail || img.urlStandard}
                alt={img.altText || productName}
                className="h-full w-full object-cover"
                draggable={false}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
