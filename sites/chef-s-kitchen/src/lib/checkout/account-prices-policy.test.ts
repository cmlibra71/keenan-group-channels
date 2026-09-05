import { test } from "node:test";
import assert from "node:assert/strict";
import { decideAccountPriceWrite } from "./account-prices-policy";
import type { ResolvedAddon } from "@keenan/services/product-addons";

const blade = (price: string): ResolvedAddon => ({
  groupKey: "slicers",
  groupLabel: "Slicers",
  optionKey: "s4",
  optionLabel: "Slicer 4mm",
  price,
  url: null,
});

// ── The rule this file exists for (card 0CDcCYmO x 7Yie3iPX, journey J3) ──────────────
// An account contract price replaces what the MACHINE costs. The extras are charged on top of
// whatever the machine ends up costing, or the shopper is shown machine+blades and charged
// machine only while `order_items.product_options` still lists the blades.

test("an account price on a configured line keeps the extras", () => {
  const out = decideAccountPriceWrite({
    record: { price: "1000.00", salePrice: "900.00" },
    resolvedAddons: [blade("245.00")],
    currentListPrice: "1200.00",
    currentSalePrice: "1100.00",
  });
  assert.equal(out.listPrice, "1245.00");
  assert.equal(out.salePrice, "1145.00");
  assert.equal(out.changed, true);
});

test("both amounts move by the same figure, so no phantom discount appears", () => {
  const out = decideAccountPriceWrite({
    record: { price: "1000.00", salePrice: "900.00" },
    resolvedAddons: [blade("245.00"), { ...blade("55.00"), optionKey: "s6" }],
    currentListPrice: null,
    currentSalePrice: null,
  });
  assert.equal(Number(out.listPrice) - Number(out.salePrice), 100);
});

test("a line already carrying the surcharged account price is left alone", () => {
  // The comparison must be against the SURCHARGED figure. Compared against the raw record a
  // correct line reads as stale on every order and is rewritten DOWN to the bare machine price.
  const out = decideAccountPriceWrite({
    record: { price: "1000.00", salePrice: "900.00" },
    resolvedAddons: [blade("245.00")],
    currentListPrice: "1245.00",
    currentSalePrice: "1145.00",
  });
  assert.equal(out.changed, false);
});

test("a plain line still takes the bare account price", () => {
  const out = decideAccountPriceWrite({
    record: { price: "1000.00", salePrice: null },
    resolvedAddons: [],
    currentListPrice: "1200.00",
    currentSalePrice: "1100.00",
  });
  assert.deepEqual(out, { listPrice: "1000.00", salePrice: null, changed: true });
});

test("a null sale price on the record stays null even with extras", () => {
  // `sale_price` null means "no discount"; the /cart Discount row reads the gap between the two,
  // so inventing a sale price here would invent a discount the size of the accessories.
  const out = decideAccountPriceWrite({
    record: { price: "1000.00", salePrice: null },
    resolvedAddons: [blade("245.00")],
    currentListPrice: null,
    currentSalePrice: null,
  });
  assert.equal(out.listPrice, "1245.00");
  assert.equal(out.salePrice, null);
});
