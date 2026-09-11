import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Chefs Depot's per-site seam wires card Sh03niVC, so its order page takes a card
// and its pro-forma may say "Pay your order" (card isl1uwjR). A SOURCE assertion,
// because this copy imports the Stripe gateway and a client component that a
// node:test run cannot load; the default copy (Industry Kitchens) is tested by
// import and answers false.
const SOURCE = readFileSync(fileURLToPath(new URL("./pay-balance-site.tsx", import.meta.url)), "utf-8");

test("Chefs Depot takes a card on an existing order", () => {
  assert.match(SOURCE, /export const ORDER_CARD_PAYMENT_OFFERED = true;/);
});

test("the link's verb and the order page's control come from ONE decision", () => {
  assert.match(SOURCE, /export async function payBalanceDecisionForOrder\(/);
  assert.match(SOURCE, /return resolvePayBalance\(order, session, opts\);/);
  assert.match(SOURCE, /const decision = await payBalanceDecisionForOrder\(order, session, opts\);/);
});
