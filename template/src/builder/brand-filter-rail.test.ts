import { test } from "node:test";
import assert from "node:assert/strict";
import { brandTreeHasFilterRail } from "./brand-filter-rail";

test("a brand tree places a filter rail only when it binds the listing facets or uses a facet master", () => {
  const leaf = (x: object) => ({ v: 1, root: { id: "r", kind: "element", tag: "div", children: [x] } });
  assert.equal(brandTreeHasFilterRail(null), false);
  assert.equal(brandTreeHasFilterRail(leaf({ id: "a", kind: "repeat", source: "products" })), false);
  assert.equal(brandTreeHasFilterRail(leaf({ id: "a", kind: "component", componentKey: "product-card" })), false);
  assert.equal(brandTreeHasFilterRail(leaf({ id: "a", kind: "component", componentKey: "facet-option" })), true);
  assert.equal(brandTreeHasFilterRail(leaf({ id: "a", kind: "component", componentKey: "filter-chips" })), true);
  assert.equal(brandTreeHasFilterRail(leaf({ id: "a", kind: "element", tag: "p", text: [{ kind: "binding", path: "listing.total" }] })), false);
  assert.equal(brandTreeHasFilterRail(leaf({ id: "a", kind: "element", tag: "div", condition: { kind: "expr", source: "listing.facets.brands[0]" } })), true);
  assert.equal(brandTreeHasFilterRail(leaf({ id: "a", kind: "repeat", source: "listing.facets.brands" })), true);
});
