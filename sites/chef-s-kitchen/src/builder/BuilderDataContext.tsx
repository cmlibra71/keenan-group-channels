import { createContext, useContext } from "react";
import type { ProductPagePayload } from "@keenan/services/builder";

/**
 * Carries the ONE aggregate payload (from getProductPageData) plus the current
 * repeat scope stack. NodeRenderer resolves every binding against this — the
 * "composables are selectors over one payload" contract, at render time.
 * Server-safe: plain context, no client-only APIs.
 */
export interface BuilderData {
  payload: ProductPagePayload;
  /** Innermost-first scope frames pushed by Repeat nodes ({ item, "@index", … }). */
  scope: Record<string, unknown>;
  /** true in the editor/draft surface (affects missing-binding + placeholder behaviour). */
  draft: boolean;
}

export const BuilderDataCtx = createContext<BuilderData | null>(null);

export function useBuilderData(): BuilderData {
  const v = useContext(BuilderDataCtx);
  if (!v) throw new Error("useBuilderData: no BuilderDataCtx provider in the tree");
  return v;
}
