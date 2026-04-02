"use client";

import { useEffect, useRef, useState, useCallback } from "react";

function useCountUp(target: number, isActive: boolean, duration = 4000, crawlShare = 0.556) {
  const [value, setValue] = useState(0);
  const [phase, setPhase] = useState<"counting" | "landing" | "done">("counting");

  useEffect(() => {
    if (!isActive) return;

    // Phase 1: Main count-up to target - last digit's value
    const lastDigit = target % 10;
    const landingTarget = target - lastDigit;
    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      let eased;
      const buildShare = (1 - crawlShare) * 0.625; // 62.5% of remainder
      const frenzyStart = crawlShare + buildShare;
      if (t < crawlShare) {
        const p = t / crawlShare;
        eased = p * p * 0.05;
      } else if (t < frenzyStart) {
        const p = (t - crawlShare) / buildShare;
        eased = 0.05 + p * p * 0.25;
      } else {
        const p = (t - frenzyStart) / (1 - frenzyStart);
        const burst = p * p * (3 - 2 * p);
        eased = 0.3 + burst * 0.7;
      }
      setValue(Math.floor(eased * landingTarget));
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        setValue(landingTarget);
        setPhase("landing");
      }
    }
    requestAnimationFrame(tick);
  }, [isActive, target, duration]);

  // Phase 2: Slow dramatic tick of last digits
  useEffect(() => {
    if (phase !== "landing") return;
    const lastDigit = target % 10;
    if (lastDigit === 0) { setPhase("done"); return; }

    let current = 0;
    function tickDigit() {
      current++;
      setValue(target - lastDigit + current);
      if (current < lastDigit) {
        setTimeout(tickDigit, 300 + current * 80); // gets slower each tick
      } else {
        setPhase("done");
      }
    }
    setTimeout(tickDigit, 400); // pause before starting
  }, [phase, target]);

  return value;
}

export function StatsBanner({
  productCount,
  brandCount,
}: {
  productCount: number;
  brandCount: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { threshold: 0.3 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const products = useCountUp(productCount, visible, 36000, 0.556);
  const brands = useCountUp(brandCount, visible, 20000, 0.3);

  return (
    <div className="absolute bottom-4 sm:bottom-6 inset-x-0 z-20 mx-auto max-w-7xl px-6 lg:px-8 flex justify-end" ref={ref}>
      <div
        className={`
          relative transition-all duration-700 ease-out
          ${visible ? "opacity-100 translate-x-0 scale-100" : "opacity-0 translate-x-8 scale-95"}
        `}
      >
        {/* Glow */}
        <div className="absolute -inset-2 bg-emerald-400/20 blur-2xl rounded-2xl animate-pulse" />
        <div className="absolute -inset-1 bg-[#45854d]/30 blur-lg rounded-xl" />

        {/* Banner */}
        <div className="relative -rotate-1 overflow-hidden rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-white/20">
          {/* Glass layers */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/25 via-[#45854d]/80 to-[#3a7341]/90 backdrop-blur-xl" />
          <div className="absolute inset-0 bg-gradient-to-t from-transparent via-white/5 to-white/15" />
          {/* Glint streaks — staggered, different speeds and angles */}
          <div className="absolute -inset-full animate-[shimmer_8s_ease-in-out_infinite]"
            style={{ background: "linear-gradient(105deg, transparent 42%, rgba(255,255,255,0.15) 46%, rgba(255,255,255,0.25) 50%, rgba(255,255,255,0.15) 54%, transparent 58%)" }}
          />
          <div className="absolute -inset-full animate-[shimmer_13s_ease-in-out_3s_infinite]"
            style={{ background: "linear-gradient(85deg, transparent 35%, rgba(255,255,255,0.08) 42%, rgba(255,255,255,0.14) 48%, rgba(255,255,255,0.08) 54%, transparent 61%)" }}
          />
          <div className="absolute -inset-full animate-[shimmer_6s_ease-in-out_7s_infinite]"
            style={{ background: "linear-gradient(115deg, transparent 44%, rgba(255,255,255,0.1) 47%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.1) 53%, transparent 56%)" }}
          />
          {/* Accent shapes */}
          <div className="absolute -top-6 -right-6 w-20 h-20 bg-white/10 rotate-45 rounded-md" />
          <div className="absolute -bottom-4 -left-4 w-14 h-14 bg-white/5 rotate-45 rounded-md" />

          <div className="relative px-3.5 py-2.5 sm:px-6 sm:py-4">
            <div className="grid grid-cols-2 gap-3 sm:gap-8">
              <div className="text-center">
                <div className="text-lg sm:text-3xl font-black text-amber-300 leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]" style={{ fontVariantNumeric: "tabular-nums", minWidth: "5ch" }}>
                  {products.toLocaleString()}
                </div>
                <div className="mt-1 sm:mt-1.5 text-[7px] sm:text-[10px] text-white/80 uppercase tracking-[0.15em] font-semibold">
                  Unique Products
                </div>
              </div>
              <div className="text-center">
                <div className="text-lg sm:text-3xl font-black text-amber-300 leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]" style={{ fontVariantNumeric: "tabular-nums", minWidth: "3ch" }}>
                  {brands.toLocaleString()}
                </div>
                <div className="mt-1 sm:mt-1.5 text-[7px] sm:text-[10px] text-white/80 uppercase tracking-[0.15em] font-semibold">
                  Exclusive Brands
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
