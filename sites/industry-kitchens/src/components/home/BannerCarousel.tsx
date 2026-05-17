"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import type { HomeImage } from "@/lib/store";

// Two carousel modes:
//  - "logo": an endless one-direction marquee of brand logos (Purell strip).
//  - "banner": a paged, auto-rotating full-bleed banner carousel (Doregrill …).
export function BannerCarousel({
  slides,
  variant = "banner",
}: {
  slides: HomeImage[];
  variant?: "banner" | "logo";
}) {
  const count = slides.length;
  if (count === 0) return null;

  if (variant === "logo") {
    const loop = [...slides, ...slides];
    return (
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="group relative overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-white to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-white to-transparent" />
          <div className="ik-marquee flex w-max items-center group-hover:[animation-play-state:paused]">
            {loop.map((slide, i) => {
              const img = (
                <div className="flex h-28 w-72 shrink-0 items-center justify-center px-6 sm:h-36 sm:w-96">
                  <Image
                    src={slide.image_url}
                    alt={slide.alt || ""}
                    width={slide.width || 400}
                    height={slide.height || 200}
                    sizes="384px"
                    className="max-h-full max-w-full w-auto h-auto object-contain"
                  />
                </div>
              );
              return slide.href ? (
                <Link key={i} href={slide.href} aria-label={slide.alt}>
                  {img}
                </Link>
              ) : (
                <span key={i}>{img}</span>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  return <PagedBanner slides={slides} count={count} />;
}

function PagedBanner({ slides, count }: { slides: HomeImage[]; count: number }) {
  const [index, setIndex] = useState(0);
  const go = useCallback((i: number) => setIndex(((i % count) + count) % count), [count]);

  useEffect(() => {
    if (count < 2) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), 6000);
    return () => clearInterval(t);
  }, [count]);

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
      <div className="relative overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <div
          className="flex transition-transform duration-700 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {slides.map((slide, i) => {
            const img = (
              <Image
                src={slide.image_url}
                alt={slide.alt || ""}
                width={slide.width || 1600}
                height={slide.height || 660}
                sizes="(max-width: 1280px) 100vw, 1280px"
                className="w-full h-auto"
                priority={i === 0}
              />
            );
            return (
              <div key={i} className="w-full shrink-0">
                {slide.href ? (
                  <Link href={slide.href} className="block">
                    {img}
                  </Link>
                ) : (
                  img
                )}
              </div>
            );
          })}
        </div>

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(index - 1)}
              aria-label="Previous slide"
              className="absolute left-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-white/85 text-zinc-800 shadow hover:bg-white"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              aria-label="Next slide"
              className="absolute right-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-white/85 text-zinc-800 shadow hover:bg-white"
            >
              ›
            </button>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
              {slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`Go to slide ${i + 1}`}
                  className={`h-2 w-2 rounded-full transition-colors ${
                    i === index ? "bg-[#D94B2B]" : "bg-white/70 ring-1 ring-zinc-300"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
