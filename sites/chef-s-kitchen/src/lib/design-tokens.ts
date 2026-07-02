import "server-only";
import { tokenSetToCssVars } from "@keenan/services";
import { getDesignTokens, getFeatureFlag } from "@/lib/store";

/**
 * PUBLISHED design tokens as CSS variables for the root layout's <html
 * style={…}> (an inline style attribute deterministically beats the fork's
 * stylesheet @theme :root definitions, so DB tokens override fork CSS and the
 * fork CSS remains the fallback).
 *
 * Fail-closed to null: flag off, no tokens, or any error → no attribute → the
 * fork renders exactly as before the design-tokens feature existed.
 */
export async function getPublishedTokenVars(): Promise<Record<string, string> | null> {
  try {
    if (!(await getFeatureFlag("design_tokens_enabled"))) return null;
    const vars = tokenSetToCssVars(await getDesignTokens());
    return Object.keys(vars).length > 0 ? vars : null;
  } catch {
    return null;
  }
}
