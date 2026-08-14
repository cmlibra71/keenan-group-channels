import { test } from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import type { ProductKit } from "../lib/product-kit.ts";

// ============================================================================
// The `product-kit` native must render from `data.kit` — the ALREADY-PARSED
// ProductKit the product route builds once (products/[slug]/page.tsx,
// `nativeData: { kit: readProductKit(product.metafields) }`).
//
// The bug this pins down (release-review blocker): the native used to call
// `readProductKit(product.metafields ?? data.kit)` — but the natives payload
// carries no `metafields` key, and `data.kit` is not metafields, it is the
// parsed kit itself. Parsing a ProductKit as if it were metafields finds no
// `.kit.items` and returns null, so kit contents could NEVER render through
// the builder path. The first test below fails on that code.
//
// `product-natives.tsx` imports through the `@/` alias, which tsx does not
// map under node:test, so an alias resolve hook is registered before the
// module (and its real component graph) is dynamically imported.
// ============================================================================

// The native's component graph reaches lib/channel.ts, which reads CHANNEL_ID at
// import time. Any value serves — nothing here touches a channel.
process.env.CHANNEL_ID ??= "2";

// tsx compiles the site's JSX (tsconfig `jsx: preserve`) with the classic
// runtime, which expects a React global at element-creation time.
import * as React from "react";
(globalThis as Record<string, unknown>).React = React;

const SRC_DIR = path.resolve(__dirname, "..");

type ResolveHook = (specifier: string, context: unknown, nextResolve: (s: string, c: unknown) => unknown) => unknown;
// `registerHooks` shipped in node 22.15/23.5 but is missing from this repo's
// @types/node, hence the cast rather than a named import.
(nodeModule as unknown as { registerHooks: (hooks: { resolve: ResolveHook }) => void }).registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(pathToFileURL(path.join(SRC_DIR, specifier.slice(2))).href, context);
    }
    // Next-only marker package, not installed as a real dependency.
    if (specifier === "server-only") {
      return nextResolve(pathToFileURL(path.join(__dirname, "server-only-shim.ts")).href, context);
    }
    return nextResolve(specifier, context);
  },
});

/** Loaded dynamically so the alias hook above is registered first (CJS: no top-level await). */
async function loadProductNatives() {
  return (await import("./product-natives.tsx")).productNatives;
}

/** A parsed grouped kit, exactly as page.tsx hands it to the node branch. */
const parsedKit: ProductKit = {
  kind: "grouped",
  items: [
    { productId: 11, sku: "OVEN-1", name: "Combi oven", quantity: 1, group: null, isDefault: false },
    { productId: 12, sku: "STAND-1", name: "Oven stand", quantity: 1, group: null, isDefault: false },
  ],
  groups: [],
};

async function kitNative(data: Record<string, unknown>, product: Record<string, unknown> = { id: 7 }) {
  const productNatives = await loadProductNatives();
  const natives = productNatives({ payload: { product }, variantImageUrl: null, data });
  const factory = natives["product-kit"] as unknown as () => { props?: { kit?: unknown; productId?: unknown } } | null;
  assert.ok(factory, "the product-kit native must be registered");
  return factory();
}

test("a parsed kit in data.kit RENDERS — the payload has no metafields to re-parse", async () => {
  const el = await kitNative({ kit: parsedKit });
  assert.notEqual(el, null, "kit contents must render for a kit product");
  assert.deepEqual(el?.props?.kit, parsedKit, "the native receives the parsed kit untouched");
  assert.equal(el?.props?.productId, 7);
});

test("a product that is not a kit renders nothing", async () => {
  assert.equal(await kitNative({ kit: null }), null);
  assert.equal(await kitNative({}), null);
});
