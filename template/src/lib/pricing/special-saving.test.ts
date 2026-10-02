import { test } from "node:test";
import assert from "node:assert/strict";
import { partnerSpecialSaving } from "./special-saving";

const l = (product_id: number | null, list: string | null, sale: string | null, quantity = 1) => ({
  product_id,
  list_price: list,
  sale_price: sale,
  quantity,
});

test("partnerSpecialSaving counts only lines on a live special", () => {
  const items = [l(816, "1580", "1300", 2), l(9, "100", "80")];
  assert.equal(partnerSpecialSaving(items, new Set([816])), 560);
  assert.equal(partnerSpecialSaving(items, new Set()), 0);
});

test("partnerSpecialSaving: a special at or above list, or an unpriced line, saves nothing", () => {
  assert.equal(partnerSpecialSaving([l(1, "100", null), l(2, "100", "100.004"), l(3, null, "5")], new Set([1, 2, 3])), 0);
  assert.equal(partnerSpecialSaving([l(null, "100", "50")], new Set([1])), 0);
});
