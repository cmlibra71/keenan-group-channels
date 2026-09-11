"use client";

import { createContext, useContext } from "react";

// ============================================================================
// Is this storefront's Chefs Depot MEMBER PRICE SCALE switched on? (card
// gk23c1VK — Tim's locked 11 Sep 2026 model.)
//
// Resolved ONCE per request in the root layout from `getLadderConfig()` — the
// same switch the pricing engine reads — and handed to client components that
// draw a price without a server parent that knows the answer (`PriceBlock` on
// the listing tiles, the non-builder product detail and the node preview).
//
// It decides WORDS, never money: under the scale the headline a guest sees is
// the Mates Rate, "our standard price", so a chip saying "RRP" beside it would
// be false, and a member saving may not carry a percentage. With the scale off
// (every channel today) the default — false — changes nothing.
// ============================================================================

const MemberScaleContext = createContext(false);

export function MemberScaleProvider({ on, children }: { on: boolean; children: React.ReactNode }) {
  return <MemberScaleContext.Provider value={on}>{children}</MemberScaleContext.Provider>;
}

/** True only while this channel's member price scale is switched on. */
export function useMemberScaleOn(): boolean {
  return useContext(MemberScaleContext);
}
