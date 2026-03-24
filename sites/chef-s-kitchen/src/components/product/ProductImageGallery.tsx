"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import Image from "next/image";
import { Package } from "lucide-react";
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
}: {
  images: ProductImage[];
  productName: string;
  variantImageUrl?: string | null;
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
  }, [variantImageUrl, images]);

  const selected = effectiveImages[selectedIndex];

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

  if (effectiveImages.length === 0) {
    return (
      <div className="h-80 overflow-hidden bg-surface-secondary">
        <div className="h-full w-full flex items-center justify-center text-text-muted">
          <Package className="h-24 w-24" strokeWidth={1.5} />
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
        className={`relative overflow-hidden flex items-center justify-center max-h-[600px] ${
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

      <p className="mt-2 text-xs text-text-muted text-center hidden sm:block">Click to zoom</p>

      {/* Thumbnail strip */}
      {effectiveImages.length > 1 && (
        <div className="mt-4 flex gap-2 overflow-x-auto">
          {effectiveImages.map((img, idx) => (
            <button
              key={img.id === -1 ? "variant" : img.id}
              onClick={() => setSelectedIndex(idx)}
              className={`relative flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 overflow-hidden bg-surface-secondary cursor-pointer transition-all ${
                idx === selectedIndex
                  ? "ring-2 ring-text-primary ring-offset-1"
                  : "hover:ring-2 hover:ring-text-muted"
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
