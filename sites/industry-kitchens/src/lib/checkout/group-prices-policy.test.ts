import { test } from "node:test";
import assert from "node:assert/strict";
import { decideGroupPriceWrite, GROUP_PRICES_UPDATED_MESSAGE } from "./group-prices-policy";

test("a line already at its group price is not rewritten — money compared to the cent, not as text", () => {
  const out = decideGroupPriceWrite({
    grouped: { listPrice: "8.7300", salePrice: "6.45" },
    resolvedAddons: [],
    currentListPrice: "8.7300",
    currentSalePrice: "6.4500",
  });
  assert.equal(out.changed, false);
});

test("a line priced before sign-in / before the switch moves to the group price (LUUS guest → Wholesale)", () => {
  const out = decideGroupPriceWrite({
    grouped: { listPrice: "9150.0000", salePrice: "6313.5000" },
    resolvedAddons: [],
    currentListPrice: "9150.0000",
    currentSalePrice: "6588.0000",
  });
  assert.equal(out.changed, true);
  assert.equal(out.listPrice, "9150.0000");
  assert.equal(out.salePrice, "6313.5000");
});

test("a sale that disappears (record carries no special) is a change", () => {
  const out = decideGroupPriceWrite({
    grouped: { listPrice: "54.0000", salePrice: null },
    resolvedAddons: [],
    currentListPrice: "54.0000",
    currentSalePrice: "408.1800",
  });
  assert.equal(out.changed, true);
  assert.equal(out.salePrice, null);
});

test("the message says nothing was charged", () => {
  assert.match(GROUP_PRICES_UPDATED_MESSAGE, /Nothing was charged/);
});
