"use client";
import * as React from "react";

// ============================================================================
// The interactive layer: node events → Actions, without rewriting any
// checkout-critical logic. Actions are named handlers supplied by the page
// (from the EXISTING ProductPurchaseProvider + the existing server actions),
// so wiring a <button> node's click to "addToCart" reaches the same code path
// the current buy box uses — nothing sealed, nothing reimplemented.
//
// Tiers:
//  - facade Actions (ref-based): addToCart, addToQuote, selectOption,
//    setQuantity, submitReview — provided via BuilderActionsCtx.
//  - local codeless ops (toggle/set-index/…) — handled by BuilderLocalState.
//  - typed-result follow-ups (toast/navigate/set-state) — run after an Action.
// ============================================================================

export type ActionResultLike = { success?: boolean; error?: string } | void | unknown;
export type ActionHandler = (args: Record<string, unknown>) => ActionResultLike | Promise<ActionResultLike>;

export interface BuilderActionsApi {
  /** Run a named facade Action; resolves to a normalized {ok,error?} result. */
  run: (ref: string, args?: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  /** App-tier capability: surface a transient message. */
  toast: (tone: "success" | "error" | "info", message: string) => void;
  /** App-tier capability: client navigation. */
  navigate: (to: string) => void;
}

export const BuilderActionsCtx = React.createContext<BuilderActionsApi | null>(null);

export function useBuilderActions(): BuilderActionsApi | null {
  return React.useContext(BuilderActionsCtx);
}

/**
 * Provide the named-Action registry + app capabilities. `handlers` is the map
 * the product page fills from its provider + server actions; `toast`/`navigate`
 * default to no-op/console so a tree renders safely even before the app-tier
 * library is wired.
 */
export function BuilderActionsProvider({
  handlers,
  toast,
  navigate,
  children,
}: {
  handlers: Record<string, ActionHandler>;
  toast?: (tone: "success" | "error" | "info", message: string) => void;
  navigate?: (to: string) => void;
  children: React.ReactNode;
}) {
  const api = React.useMemo<BuilderActionsApi>(
    () => ({
      run: async (ref, args = {}) => {
        const h = handlers[ref];
        if (!h) return { ok: false, error: `Unknown action: ${ref}` };
        try {
          const res = await h(args);
          if (res && typeof res === "object" && "success" in res) {
            const r = res as { success?: boolean; error?: string };
            return { ok: r.success !== false, error: r.error };
          }
          return { ok: true };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : "Action failed" };
        }
      },
      toast: toast ?? ((tone, message) => console.info(`[toast:${tone}] ${message}`)),
      navigate: navigate ?? ((to) => { if (typeof window !== "undefined") window.location.assign(to); }),
    }),
    [handlers, toast, navigate]
  );
  return <BuilderActionsCtx.Provider value={api}>{children}</BuilderActionsCtx.Provider>;
}

// ── Local codeless state (Toggle / Active-index), ARIA left to the primitives ─

export interface LocalStateApi {
  get: (name: string) => boolean | number | undefined;
  set: (name: string, value: boolean | number | "toggle") => void;
}

export const BuilderLocalStateCtx = React.createContext<LocalStateApi | null>(null);

export function useBuilderLocalState(): LocalStateApi | null {
  return React.useContext(BuilderLocalStateCtx);
}

/** Holds a subtree's declared local state (from LocalStateDecl on nodes). */
export function BuilderLocalStateProvider({
  initial,
  children,
}: {
  initial?: Record<string, boolean | number>;
  children: React.ReactNode;
}) {
  const [state, setState] = React.useState<Record<string, boolean | number>>(initial ?? {});
  const api = React.useMemo<LocalStateApi>(
    () => ({
      get: (name) => state[name],
      set: (name, value) =>
        setState((prev) => ({
          ...prev,
          [name]: value === "toggle" ? !prev[name] : value,
        })),
    }),
    [state]
  );
  return <BuilderLocalStateCtx.Provider value={api}>{children}</BuilderLocalStateCtx.Provider>;
}
