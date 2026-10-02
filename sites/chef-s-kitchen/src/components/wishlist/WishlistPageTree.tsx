"use client";

// ============================================================================
// /account/wishlist drawn from the CMS: the channel's `account-wishlist` master (its heading, any
// copy around the list, the list's words and their Show-ifs — all authored in the Site Builder),
// with the sealed `wishlist-items` native handed the shopper's rows. Engine — identical on every
// site; a channel with no such master draws nothing (and the page is switched off there anyway).
// ============================================================================

import * as React from "react";
import Link from "next/link";
import type { NodeTree } from "@keenan/services/builder";
import type { WishlistLine } from "@keenan/services";
import { BuilderTree, type NativeComponents } from "@keenan/services/builder-react";
import BuilderImage from "@/builder/builder-image";
import { ACCOUNT_WISHLIST_NATIVE, ACCOUNT_WISHLIST_TREE } from "@/builder/wishlist-node";
import { WishlistItems } from "./WishlistItems";

/** The rows the page was rendered with, read by the native below. */
const WishlistDataCtx = React.createContext<{
  items: WishlistLine[];
  addedItemId: number | null;
  onCountChange?: (count: number) => void;
}>({ items: [], addedItemId: null });

/**
 * The native, as ONE stable component reading the rows from context. It must not be a closure
 * over the rows: a server action that touches cookies (the pending-add claim) makes Next re-render
 * this route, and a new closure would be a new component type — React would remount the list and
 * lose what the claim just announced.
 */
function WishlistItemsNative(props: Record<string, unknown>) {
  const { items, addedItemId, onCountChange } = React.useContext(WishlistDataCtx);
  return <WishlistItems {...props} initialItems={items} addedItemId={addedItemId} onCountChange={onCountChange} />;
}

const NATIVES: NativeComponents = { [ACCOUNT_WISHLIST_NATIVE]: WishlistItemsNative };

export function WishlistPageTree({
  items,
  addedItemId,
  components,
  namedStyles = {},
  draft = false,
}: {
  items: WishlistLine[];
  addedItemId: number | null;
  components: Record<string, NodeTree>;
  namedStyles?: Record<string, string[]>;
  draft?: boolean;
}) {
  // `wishlist.count` is LIVE: the list reports every add/remove, and the binding scope (which wins
  // over the payload) carries it, so a master Show-if such as `wishlist.count == 0` follows edits.
  const [count, setCount] = React.useState(items.length);
  React.useEffect(() => setCount(items.length), [items.length]);
  const data = React.useMemo(() => ({ items, addedItemId, onCountChange: setCount }), [items, addedItemId]);
  const payload = React.useMemo(
    () => ({ context: { kind: "account", page: "wishlist" }, wishlist: { count: items.length } }),
    [items.length]
  );
  const scope = React.useMemo(() => ({ wishlist: { count } }), [count]);
  return (
    <WishlistDataCtx.Provider value={data}>
      <BuilderTree
        tree={ACCOUNT_WISHLIST_TREE}
        payload={payload}
        scope={scope}
        namedStyles={namedStyles}
        components={components}
        nativeComponents={NATIVES}
        linkComponent={Link as unknown as React.ComponentType<Record<string, unknown>>}
        imageComponent={BuilderImage}
        draft={draft}
      />
    </WishlistDataCtx.Provider>
  );
}
