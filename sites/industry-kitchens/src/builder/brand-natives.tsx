"use client";
import type { NativeComponents } from "@keenan/services/builder-react";

// Industry Kitchens seals nothing on the brand page any more.
//
// `brand-products` used to be registered here — a client copy of the Products
// section, standing in until the section itself was authored. The brand tree
// now lays out that grid in nodes and places the shared `product-card` master,
// so the registration became dead code, and a dead native is not harmless:
// natives WIN over masters by key, so leaving it would silently un-explode the
// grid the moment anyone minted a `brand-products` master.
//
// The signature stays so the wrapper keeps its seam — a site that does need a
// sealed leaf here fills this in.
export function brandNatives(_args: {
  products: unknown[];
  pricing: Record<string, unknown>;
  memberPricingAvailable: boolean;
  brandSlug?: string;
  brandName?: string;
}): NativeComponents {
  void _args;
  return {};
}
