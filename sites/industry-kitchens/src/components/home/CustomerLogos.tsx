"use client";
// Pure presentational — it only ever imported a TYPE from the store, so the
// boundary move changes what ships to the browser, not what is drawn. Needed so
// the Site Builder natives can render the same component the live page does,
// rather than a second copy that would drift.

import Image from "next/image";
import type { CustomerLogo } from "@/lib/store";

export type { CustomerLogo };

// Auto-scrolling colour logo marquee — the "Some of our valued customers" wall.
// The track holds two copies of the list so the CSS marquee loops seamlessly.
export function CustomerLogos({
  heading,
  logos,
}: {
  heading?: string;
  logos?: CustomerLogo[];
}) {
  if (!logos || logos.length === 0) return null;
  const loop = [...logos, ...logos];
  return (
    <section className="border-y border-zinc-200 bg-white">
      <div className="py-12">
        {heading && (
          <h2 className="mb-9 text-center text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
            {heading}
          </h2>
        )}
        <div className="group relative overflow-hidden">
          {/* edge fades */}
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-white to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-white to-transparent" />
          <div className="ik-marquee flex w-max items-center gap-10 sm:gap-14 group-hover:[animation-play-state:paused]">
            {loop.map((logo, i) => (
              <div
                key={i}
                className="flex h-20 w-44 shrink-0 items-center justify-center sm:h-24 sm:w-52"
              >
                {logo.image_url ? (
                  <Image
                    src={logo.image_url}
                    alt={logo.name}
                    width={240}
                    height={120}
                    className="max-h-full max-w-full w-auto h-auto object-contain"
                  />
                ) : (
                  <span className="whitespace-nowrap text-lg font-semibold text-zinc-400">
                    {logo.name}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
