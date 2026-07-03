"use client";

import { useEffect, useRef } from "react";
import { ga4ViewPromotion, ga4SelectPromotion, type Ga4Promo } from "./ga4";

/**
 * Wraps an internal-promotion creative (hero banner, clearance spotlight, promo
 * tile, split promo…) and emits the GA4 promotion events:
 *   • view_promotion — once, when the creative scrolls into view
 *   • select_promotion — when the user clicks anywhere in it (bubbles from the CTA)
 *
 * Renders a plain block wrapper so it drops into a server-rendered section list
 * without changing layout. No-ops when GA4 isn't configured (gtag never loads).
 */
export function Ga4Promotion({
  promotion,
  className,
  children,
}: {
  promotion: Ga4Promo;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const viewed = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || viewed.current || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !viewed.current) {
            viewed.current = true;
            ga4ViewPromotion(promotion);
            io.disconnect();
          }
        }
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => io.disconnect();
    // promotion is a stable per-render descriptor; re-fire only if slot changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promotion.creative_slot, promotion.promotion_id]);

  return (
    <div ref={ref} className={className} onClickCapture={() => ga4SelectPromotion(promotion)}>
      {children}
    </div>
  );
}
