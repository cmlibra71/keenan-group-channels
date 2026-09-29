import { test } from "node:test";
import assert from "node:assert/strict";
import { goodsTotalMoved, goodsTotalOf, PRICES_CHANGED_MESSAGE } from "./shown-total";

const line = (list: string, sale: string | null, quantity = 1) => ({ list_price: list, sale_price: sale, quantity });

test("the same lines always agree to the cent (no false refusal)", () => {
  const items = [line("9150.0000", "6588.0000"), line("8.7300", "6.45", 12), line("0.1", null, 3)];
  const shown = goodsTotalOf(items);
  assert.equal(goodsTotalMoved(shown, items), false);
  assert.equal(goodsTotalMoved(String(shown), items), false);
});

test("a line re-priced after the page rendered refuses — the stale page's figure cannot pay", () => {
  // Guest LUUS-CS-12C shown at the product special, re-priced to the NOT LOGGED IN list at charge.
  const shownPage = goodsTotalOf([line("9150.0000", "6588.0000")]);
  const billed = [line("9150.0000", "6862.5000")];
  assert.equal(goodsTotalMoved(shownPage, billed), true);
  // After the refresh the page posts the new figure: the re-confirmed press goes through.
  assert.equal(goodsTotalMoved(goodsTotalOf(billed), billed), false);
});

test("no posted figure (an old form) never refuses; the message says nothing was charged", () => {
  assert.equal(goodsTotalMoved(undefined, [line("1", null)]), false);
  assert.equal(goodsTotalMoved("", [line("1", null)]), false);
  assert.match(PRICES_CHANGED_MESSAGE, /Nothing was charged/);
});
