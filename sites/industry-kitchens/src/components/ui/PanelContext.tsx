"use client";

import { createContext, useContext } from "react";

export const PanelContext = createContext<{ isOpen: boolean; close: () => void } | null>(null);

export function usePanelContext() {
  const ctx = useContext(PanelContext);
  if (!ctx) throw new Error("usePanelContext must be used inside a <SlidePanel>");
  return ctx;
}
