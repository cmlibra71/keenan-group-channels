import { test } from "node:test";
import assert from "node:assert/strict";
import { proFormaPayCall } from "./pro-forma-pay-call";

/**
 * The pro-forma is the ONLY email the storefront account-acceptance path sends,
 * so this button is the whole of what the customer is told about paying. Card
 * isl1uwjR made that path convert, which retired the Pay control on the page the
 * button used to point at.
 */

const CD = { siteUrl: "https://chefsdepot.com.au", quoteId: 42 };

test("with no order it is exactly the document it always was", () => {
  const call = proFormaPayCall({ ...CD, convertedOrderId: null, canPayByCard: true });
  assert.equal(call.href, "https://chefsdepot.com.au/account/quotes/42");
  assert.equal(call.label, "Pay this quote");
  assert.equal(call.intro, "", "no order was raised, so the email must not claim one");
});

test("a converted quote is paid on the ORDER, never on the quote page", () => {
  const call = proFormaPayCall({ ...CD, convertedOrderId: 154721, canPayByCard: true });
  assert.equal(call.href, "https://chefsdepot.com.au/account/orders/154721");
  assert.doesNotMatch(
    call.href,
    /\/account\/quotes\//,
    "converted_to_order is terminal in quote-payable.ts — the quote page has no Pay control left"
  );
  assert.equal(call.label, "Pay your order");
  assert.match(call.intro, /order has been raised/);
});

test("a storefront that cannot take a card does not promise one", () => {
  // Industry Kitchens: card Sh03niVC's Pay-by-card is Chefs Depot only, and IK
  // is where 281 of the 415 open gate-passing quotes live (prod, 2026-09-11).
  const call = proFormaPayCall({
    siteUrl: "https://industrykitchens.com.au",
    quoteId: 42,
    convertedOrderId: 154722,
    canPayByCard: false,
  });
  assert.equal(call.href, "https://industrykitchens.com.au/account/orders/154722");
  assert.equal(call.label, "View your order");
  assert.doesNotMatch(call.label, /\bPay\b/, "a promise this storefront cannot keep");
  assert.match(
    call.footer,
    /invoice follows by email/,
    "the same fallback sentence the portal's acknowledgement page uses when it can draw no pay control"
  );
});

test("an unusable order id reads as no order rather than building a broken link", () => {
  for (const bad of [0, -1, Number.NaN] as number[]) {
    const call = proFormaPayCall({ ...CD, convertedOrderId: bad, canPayByCard: true });
    assert.equal(call.href, "https://chefsdepot.com.au/account/quotes/42", `id ${bad}`);
    assert.equal(call.label, "Pay this quote");
  }
});

test("a trailing slash on the site url never doubles up in the link", () => {
  const call = proFormaPayCall({
    siteUrl: "https://chefsdepot.com.au/",
    quoteId: 42,
    convertedOrderId: 9,
    canPayByCard: true,
  });
  assert.equal(call.href, "https://chefsdepot.com.au/account/orders/9");
});
