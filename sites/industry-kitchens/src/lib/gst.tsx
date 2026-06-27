"use client";

import { createContext, useContext, useState, useCallback } from "react";

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

// adjustForGst (pure GST display math) is the single source of truth in
// @keenan/services; re-exported so `@/lib/gst` consumers keep importing it here.
export { adjustForGst } from "@keenan/services/calc";
