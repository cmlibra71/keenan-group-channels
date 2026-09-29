import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * SOURCE GUARD — a checkout that re-prices the cart refuses, refreshes, and makes the shopper press
 * Pay again at the price on screen (lib/checkout/shown-total.ts; judge B1 on customer-group
 * pricing). A unit test of `goodsTotalMoved` cannot see WHERE it is called: a check placed after the
 * order is written, or a form that never re-renders on refusal, would pass it. This pins the three
 * pieces: the page posts what it rendered, `placeOrder` refuses before any order or payment exists,
 * and the form refreshes on that refusal.
 */
const SRC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");
const at = (source: string, needle: string, from = 0) => {
  const i = source.indexOf(needle, from);
  assert.notEqual(i, -1, `"${needle}" not found — this guard needs rewriting`);
  return i;
};

test("placeOrder re-prices, then refuses on a moved goods total BEFORE building or writing the order", () => {
  const src = read("lib/actions/checkout.ts");
  const groupReprice = at(src, "repriceGroupLinesForCheckout(cartWithItems.id");
  const guard = at(src, 'goodsTotalMoved(formData.get("shown_goods_total")');
  const build = at(src, "buildLineItems(fullCart.items");
  const write = at(src, "orderService.create(");
  assert.ok(groupReprice < guard && guard < build && build < write);
  // Both refusals tell the form to refresh.
  assert.ok((src.match(/pricesChanged: true/g) ?? []).length >= 3);
});

test("the checkout page posts the goods total it rendered, and the form refreshes on a re-price", () => {
  assert.match(read("app/checkout/page.tsx"), /shownGoodsTotal=\{goodsTotalOf\(cart\.items/);
  const form = read("components/checkout/CheckoutForm.tsx");
  assert.match(form, /name="shown_goods_total"/);
  assert.match(form, /if \(state\?\.pricesChanged\) router\.refresh\(\);/);
});
