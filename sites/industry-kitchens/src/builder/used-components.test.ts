import { test } from "node:test";
import assert from "node:assert/strict";
import { usedComponents } from "./used-components.ts";

const ref = (id: string, componentKey: string) => ({ id, kind: "component", componentKey });
const master = (...children: unknown[]) => ({ v: 1, root: { id: "r", kind: "element", tag: "div", children } });

const library = {
  "product-card": master(ref("a", "price-block"), ref("b", "add-to-cart")),
  "price-block": master({ id: "t", kind: "element", tag: "span", text: "$1" }),
  "add-to-cart": master(),
  "filter-rail": master(ref("c", "facet-option")),
  "facet-option": master(),
  "enquiry-form": master(),
};

test("keeps the masters the tree places, and the masters THEY place", () => {
  const tree = master({ id: "grid", kind: "repeat", children: [ref("card", "product-card")] });
  assert.deepEqual(Object.keys(usedComponents(tree, library)), ["product-card", "price-block", "add-to-cart"]);
});

test("the kept masters are the very same objects (nothing is rewritten)", () => {
  const out = usedComponents(master(ref("x", "price-block")), library);
  assert.equal(out["price-block"], library["price-block"]);
});

test("finds a placement in emptyChildren or any other nested field", () => {
  const tree = master({ id: "rep", kind: "repeat", children: [], emptyChildren: [ref("e", "enquiry-form")] });
  assert.deepEqual(Object.keys(usedComponents(tree, library)), ["enquiry-form"]);
});

test("a key with no master is ignored; a cycle terminates", () => {
  const cyclic = { a: master(ref("1", "b")), b: master(ref("2", "a")), c: master() };
  assert.deepEqual(Object.keys(usedComponents(master(ref("x", "a"), ref("y", "missing")), cyclic)), ["a", "b"]);
});

test("a tree that places nothing ships no masters", () => {
  assert.deepEqual(usedComponents(master(), library), {});
});
