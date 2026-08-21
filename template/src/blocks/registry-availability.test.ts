// ============================================================================
// Drift guard: the portal's Add-a-block list vs what this fork can draw.
//
// The shared Block Registry (@keenan/services) carries an `availability` table
// saying which storefronts can render each block, and the portal builds its
// palette from it. That table had drifted: Chefs Depot was offered Banner and
// Category Grid, had components for neither, and the page came back "Block
// banner is not available on this site" in preview and blank to a shopper
// (card wp4GM2tq, Steve 2026-07-28). Nothing failed, because nothing checked.
//
// This test checks it, both ways, for THIS fork. It reads the component map as
// SOURCE rather than importing it: the map pulls in React components, `next/*`
// and `@/lib/store`, none of which belong in a unit test.
// ============================================================================
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BLOCK_REGISTRY, isBlockAvailable } from "@keenan/services";

/** Which storefront this fork is, matching the registry's channelKeys. */
const CHANNEL_KEY = "template";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAP_FILES = ["registry.tsx", "home-blocks.tsx", "category-blocks.tsx", "product-blocks.tsx"];

/** Every key of every `*BLOCK_COMPONENTS` object literal in this directory. */
function componentTypes(): Set<string> {
  const types = new Set<string>();
  for (const file of MAP_FILES) {
    const full = path.join(HERE, file);
    if (!fs.existsSync(full)) continue;
    const src = fs.readFileSync(full, "utf8");
    for (const block of src.match(/BLOCK_COMPONENTS[^{]*\{[\s\S]*?\n\};/g) ?? []) {
      for (const m of block.matchAll(/^ {2}([a-z0-9_]+):/gm)) types.add(m[1]);
    }
  }
  return types;
}

test("block component map parses (guards this test against passing vacuously)", () => {
  const types = componentTypes();
  assert.ok(types.size >= 10, `only found ${types.size} block components — the parse is wrong`);
  assert.ok(types.has("rich_text"));
  assert.ok(types.has("content_page"));
});

test("every block this fork is OFFERED, it can draw", () => {
  const types = componentTypes();
  const offered = Object.values(BLOCK_REGISTRY)
    .filter((d) => !d.deprecated)
    .filter((d) => isBlockAvailable(d, CHANNEL_KEY))
    .map((d) => d.type);
  const cannotDraw = offered.filter((t) => !types.has(t));
  assert.deepEqual(
    cannotDraw,
    [],
    `${CHANNEL_KEY} is offered blocks it has no component for: ${cannotDraw.join(", ")}. ` +
      `Either add the component here, or take the block out of this channel's ` +
      `\`availability\` in @keenan/services src/cms/registry.ts.`
  );
});

/** Plumbing the routes render themselves; deliberately not placeable, so the
 *  shared registry defines no palette entry for them. `product_slot` pulls the
 *  legacy `__product__` document's blocks into the product template. */
const INTERNAL_ONLY = new Set(["product_slot"]);

test("every block this fork can draw is a real registry type", () => {
  const unknown = [...componentTypes()].filter((t) => !BLOCK_REGISTRY[t] && !INTERNAL_ONLY.has(t));
  assert.deepEqual(
    unknown,
    [],
    `component map carries types the shared registry does not define: ${unknown.join(", ")}`
  );
});
