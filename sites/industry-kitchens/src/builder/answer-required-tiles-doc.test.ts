import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { NodeTree } from "@keenan/services/builder";
import { withAnswerRequiredTilesInDoc } from "./answer-required-tiles-doc.ts";

// The Industry Kitchens upsell tile as stored (cms_pages `__template-product`, read 2026-09-28):
// a configurable tile's "View Details" link and a simple tile's Add to Quote / Add to Basket.
const tile = {
  v: 1,
  root: {
    id: "ikp-upsell-item",
    tag: "div",
    kind: "element",
    children: [
      {
        id: "ikp-upsell-view",
        tag: "a",
        kind: "element",
        condition: { kind: "expr", source: "card.from_price" },
        attrs: { href: { kind: "binding", path: "card.href" } },
      },
      {
        id: "ikp-upsell-quote",
        tag: "button",
        kind: "element",
        condition: { kind: "expr", source: "!card.from_price && !card.quote_refused" },
        events: [{ on: "click", action: { kind: "action", ref: "addToQuote", args: { productId: { kind: "binding", path: "card.id" } } } }],
      },
      {
        id: "ikp-upsell-cart",
        tag: "button",
        kind: "element",
        condition: { kind: "expr", source: "!card.from_price && !card.cart_refused" },
        events: [{ on: "click", action: { kind: "action", ref: "addToCart", args: { productId: { kind: "binding", path: "card.id" } } } }],
      },
    ],
  },
} as unknown as NodeTree;

type N = { id: string; condition?: { source: string }; children?: N[] };
const cond = (tree: unknown, id: string) =>
  ((tree as { root: N }).root.children ?? []).find((n) => n.id === id)?.condition?.source;

test("the stored product template's upsell tile: View Details widened, buy buttons guarded", () => {
  const doc = { builder_kind: "nodes", node_tree: tile, id: 69 };
  const out = withAnswerRequiredTilesInDoc(doc);
  assert.notEqual(out, doc);
  assert.equal(out.id, 69);
  assert.equal(cond(out.node_tree, "ikp-upsell-view"), "card.from_price || card.answer_required");
  assert.match(cond(out.node_tree, "ikp-upsell-quote") ?? "", /&& !card\.answer_required$/);
  assert.match(cond(out.node_tree, "ikp-upsell-cart") ?? "", /&& !card\.answer_required$/);
  // The stored tree is never mutated.
  assert.equal(cond(doc.node_tree, "ikp-upsell-view"), "card.from_price");
});

test("a doc with no tile, no tree, or no doc comes back as the SAME object", () => {
  const plain = { builder_kind: "nodes", node_tree: { v: 1, root: { id: "r", kind: "element", tag: "div" } } };
  assert.equal(withAnswerRequiredTilesInDoc(plain), plain);
  const html = { builder_kind: "html", node_tree: null };
  assert.equal(withAnswerRequiredTilesInDoc(html), html);
  assert.equal(withAnswerRequiredTilesInDoc(null), null);
});

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
test("wired for THIS storefront only: IK's store wraps templates and masters; Chefs Depot's does not", () => {
  const ik = readFileSync(path.join(SRC, "lib/store.ts"), "utf8");
  assert.match(ik, /getCmsTemplate: getCmsTemplateRaw/);
  assert.match(ik, /withAnswerRequiredTilesInDoc\(await getCmsTemplateRaw\(/);
  assert.match(ik, /withAnswerRequiredTilesInComponents\(/);
  const cd = readFileSync(path.join(SRC, "../../chef-s-kitchen/src/lib/store.ts"), "utf8");
  assert.doesNotMatch(cd, /withAnswerRequiredTiles/);
});
