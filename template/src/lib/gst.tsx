"use client";

import { createContext, useContext, useState, useCallback } from "react";

const GST_RATE = 0.1;

type GstContextValue = {
  /** true → show GST-inclusive prices; false → GST-exclusive (default). */
  inclusive: boolean;
  /** true → stored DB prices already include GST. */
  pricesIncludeTax: boolean;
  toggle: () => void;
};

const GstContext = createContext<GstContextValue>({
  inclusive: false,
  pricesIncludeTax: false,
  toggle: () => {},
});

export function GstProvider({
  initialInclusive,
  pricesIncludeTax,
  children,
}: {
  initialInclusive: boolean;
  pricesIncludeTax: boolean;
  children: React.ReactNode;
}) {
  const [inclusive, setInclusive] = useState(initialInclusive);

  const toggle = useCallback(() => {
    setInclusive((prev) => {
      const next = !prev;
      // Persist for SSR on the next load so prices render without a flash.
      document.cookie = `gst_inclusive=${next}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);

  return (
    <GstContext.Provider value={{ inclusive, pricesIncludeTax, toggle }}>
      {children}
    </GstContext.Provider>
  );
}

export function useGst() {
  return useContext(GstContext);
}

/** Convert a stored price to the requested GST display mode. */
export function adjustForGst(
  amount: number,
  inclusive: boolean,
  pricesIncludeTax: boolean
): number {
  if (inclusive === pricesIncludeTax) return amount;
  return inclusive ? amount * (1 + GST_RATE) : amount / (1 + GST_RATE);
}
