import { test } from "node:test";
import assert from "node:assert/strict";
import { cardPrice } from "./card-price.ts";

test("a real sale strikes the price through", () => {
  assert.deepEqual(cardPrice({ price: "3996.0000", salePrice: "2514.6800" }), { list: 3996, sale: 2514.68, from: false });
});

test("a sale price at or above the price is NOT a sale (sale-not-below-price)", () => {
  assert.equal(cardPrice({ price: "100", salePrice: "100" }).sale, null);
  assert.equal(cardPrice({ price: "100", salePrice: "120" }).sale, null);
  assert.equal(cardPrice({ price: "100", salePrice: "0" }).sale, null);
  assert.equal(cardPrice({ price: "0", salePrice: "50" }).sale, null);
});

test("a configurable with a from price reads Starting From, not Call for Price", () => {
  assert.deepEqual(cardPrice({ price: "0", fromPrice: "554.00", fromSalePrice: "425.46" }), {
    list: 554,
    sale: 425.46,
    from: true,
  });
  assert.deepEqual(cardPrice({ price: "0", fromPrice: "554.00" }), { list: 554, sale: null, from: true });
});

test("no price and no from price: 0 (Call for Price)", () => {
  assert.deepEqual(cardPrice({ price: "0.0000", salePrice: null, fromPrice: null }), { list: 0, sale: null, from: false });
  assert.deepEqual(cardPrice({ price: null }), { list: 0, sale: null, from: false });
});
