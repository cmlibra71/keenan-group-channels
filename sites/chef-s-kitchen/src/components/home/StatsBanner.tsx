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

  // Design-system hero stat card: translucent brand-green gradient over the
  // photo, gold figures, caps labels. Sits under the Member Benefits card in
  // the hero's right column.
  return (
    <div
      ref={ref}
      className={`ml-auto flex w-full max-w-[430px] gap-9 rounded-panel border border-white/[0.18] bg-[linear-gradient(135deg,rgba(69,132,77,.62),rgba(46,94,54,.72))] px-6 py-[18px] backdrop-blur-[10px] transition-all duration-700 ease-out ${
        visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
      }`}
    >
      <div>
        <b
          className="block text-3xl font-bold leading-none text-member-bright"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {products.toLocaleString()}
        </b>
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-white/85">
          Unique Products
        </span>
      </div>
      <div>
        <b
          className="block text-3xl font-bold leading-none text-member-bright"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {brands.toLocaleString()}
        </b>
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-white/85">
          Exclusive Brands
        </span>
      </div>
    </div>
  );
}
