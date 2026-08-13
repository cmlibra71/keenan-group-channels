"use client";

// ============================================================================
// The bundle configuration the page is currently showing — card 7bmpuqei.
//
// A bundle's Add to Quote must send the customer's picks. On the authored node tree (the path
// BOTH live storefronts render) the CTA is an authored button wired to the shared
// `addToQuote` handler in @keenan/services, which knows nothing about kits and passes no choices —
// so without this the server refused every bundle and the button did nothing at all.
//
// Holding the selection ABOVE the tree fixes that without a services change: the page's own
// addToQuote wrapper reads the live selection here, so the authored CTA and the kit block's own
// CTA send exactly the same build. The selection starts on the author's defaults (one pick per
// group, always complete), so a customer who never touches the pickers still sends a whole,
// server-resolvable configuration rather than an error.
//
// Not in the purchase provider on purpose: a bundle is never priced live, so this must not sit in
// the pricing state the two storefronts and the portal editor canvas share.
// ============================================================================

import * as React from "react";
import { defaultKitSelection, toKitChoices, type KitChoice, type ProductKit } from "@/lib/product-kit";

interface KitSelectionValue {
  kit: ProductKit | null;
  selection: Record<string, number>;
  select: (group: string, productId: number) => void;
  /** Complete when every group has an answer — always true off the defaults. */
  ready: boolean;
}

const KitSelectionCtx = React.createContext<KitSelectionValue | null>(null);

export function KitSelectionProvider({
  kit,
  children,
}: {
  kit: ProductKit | null;
  children: React.ReactNode;
}) {
  const [selection, setSelection] = React.useState<Record<string, number>>(() =>
    kit?.kind === "bundle" ? defaultKitSelection(kit.groups) : {}
  );
  const select = React.useCallback(
    (group: string, productId: number) => setSelection((prev) => ({ ...prev, [group]: productId })),
    []
  );
  const value = React.useMemo<KitSelectionValue>(
    () => ({
      kit,
      selection,
      select,
      ready: kit?.kind !== "bundle" || kit.groups.every((g) => selection[g.name] != null),
    }),
    [kit, selection, select]
  );
  return <KitSelectionCtx.Provider value={value}>{children}</KitSelectionCtx.Provider>;
}

/** The live selection, or nulls when the page has no kit (every ordinary product). */
export function useKitSelection(): KitSelectionValue {
  return (
    React.useContext(KitSelectionCtx) ?? { kit: null, selection: {}, select: () => {}, ready: true }
  );
}

/**
 * A ref carrying the choices to send with Add to Quote, for callers that must not re-memoize when
 * the customer changes a pick (the action handlers the builder tree binds to are built once).
 * Null for anything that is not a bundle, which is what the server expects.
 */
export function useKitChoicesRef(): React.RefObject<KitChoice[] | null> {
  const { kit, selection } = useKitSelection();
  const ref = React.useRef<KitChoice[] | null>(null);
  ref.current = kit?.kind === "bundle" ? toKitChoices(selection) : null;
  return ref;
}
