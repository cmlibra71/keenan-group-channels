import { test } from "node:test";
import assert from "node:assert/strict";
import { pickBestBulkUnit, layerCartPrice, type BulkRule } from "./cart-pricing.ts";

// ---- pickBestBulkUnit ------------------------------------------------------

const rule = (over: Partial<BulkRule>): BulkRule => ({
  quantity_min: 1,
  quantity_max: null,
  type: "price",
  amount: "10",
  ...over,
});

test("no tiers -> null", () => {
  assert.equal(pickBestBulkUnit([], 5, 100), null);
});

test("tier applies at/above quantity_min (inclusive)", () => {
  const rules = [rule({ quantity_min: 10, amount: "8" })];
  assert.equal(pickBestBulkUnit(rules, 9, 100), null);
  assert.equal(pickBestBulkUnit(rules, 10, 100), 8);
  assert.equal(pickBestBulkUnit(rules, 50, 100), 8);
});

test("quantity_max upper bound is inclusive", () => {
  const rules = [rule({ quantity_min: 10, quantity_max: 20, amount: "8" })];
  assert.equal(pickBestBulkUnit(rules, 20, 100), 8);
  assert.equal(pickBestBulkUnit(rules, 21, 100), null);
});

test("percent tiers discount off the list price", () => {
  const rules = [rule({ quantity_min: 1, type: "percent", amount: "25" })];
  assert.equal(pickBestBulkUnit(rules, 1, 100), 75);
});

test("lowest matching tier wins", () => {
  const rules = [
    rule({ quantity_min: 10, amount: "9" }),
    rule({ quantity_min: 10, amount: "7" }),
    rule({ quantity_min: 10, type: "percent", amount: "50" }), // 50 off 100 = 50
  ];
  assert.equal(pickBestBulkUnit(rules, 10, 100), 7);
});

test("non-finite amounts are skipped", () => {
  const rules = [rule({ amount: "not-a-number" })];
  assert.equal(pickBestBulkUnit(rules, 5, 100), null);
});

// ---- layerCartPrice --------------------------------------------------------

const base = {
  listPrice: "100",
  catalogSalePrice: null as string | null,
  suppress: false,
  memberSalePrice: null as string | null,
  bulkUnit: null as number | null,
};

test("no discounts -> salePrice stays null (RRP)", () => {
  assert.deepEqual(layerCartPrice(base), { listPrice: "100", salePrice: null });
});

test("catalog sale price passes through when nothing beats it", () => {
  assert.equal(layerCartPrice({ ...base, catalogSalePrice: "80" }).salePrice, "80");
});

test("suppression zeroes catalog sale price (RRP applies)", () => {
  assert.equal(layerCartPrice({ ...base, catalogSalePrice: "80", suppress: true }).salePrice, null);
});

test("member price wins only when lower than the catalog sale", () => {
  // member 70 < sale 80 -> member
  assert.equal(layerCartPrice({ ...base, catalogSalePrice: "80", memberSalePrice: "70" }).salePrice, "70");
  // member 90 > sale 80 -> keep the lower sale
  assert.equal(layerCartPrice({ ...base, catalogSalePrice: "80", memberSalePrice: "90" }).salePrice, "80");
});

test("member price applies over RRP when there is no catalog sale", () => {
  assert.equal(layerCartPrice({ ...base, memberSalePrice: "70" }).salePrice, "70");
});

test("member price still applies on a suppressed (member-only) channel", () => {
  assert.equal(
    layerCartPrice({ ...base, catalogSalePrice: "80", suppress: true, memberSalePrice: "70" }).salePrice,
    "70"
  );
});

test("bulk tier wins only when below the current effective price", () => {
  // bulk 60 < sale 80 -> bulk
  assert.equal(layerCartPrice({ ...base, catalogSalePrice: "80", bulkUnit: 60 }).salePrice, "60");
  // bulk 90 > sale 80 -> keep sale
  assert.equal(layerCartPrice({ ...base, catalogSalePrice: "80", bulkUnit: 90 }).salePrice, "80");
  // bulk 90 < RRP 100, no sale -> bulk
  assert.equal(layerCartPrice({ ...base, bulkUnit: 90 }).salePrice, "90");
});

test("bulk tiers are ignored on a suppressed channel", () => {
  assert.equal(layerCartPrice({ ...base, suppress: true, bulkUnit: 60 }).salePrice, null);
});

test("best-price-wins across all three layers", () => {
  // catalog 80, member 70, bulk 65 -> 65 wins
  assert.equal(
    layerCartPrice({ ...base, catalogSalePrice: "80", memberSalePrice: "70", bulkUnit: 65 }).salePrice,
    "65"
  );
});
