import { test } from "node:test";
import assert from "node:assert/strict";
import { accountAcceptanceHoldsConversion, proFormaCanPayByCard, proFormaPayCall } from "./pro-forma-pay-call";

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

/**
 * A deposit quote is still paid on the QUOTE. The pro-forma names "Deposit due
 * now $X" (card 0Wy0xHuq) and the order page's Pay control would take the whole
 * balance (card Sh03niVC, no partial payments), so the account-area acceptance
 * holds the conversion and the deposit payment raises the order.
 */
test("a quote carrying a rep-set deposit holds the conversion; every other quote converts", () => {
  assert.equal(accountAcceptanceHoldsConversion({ deposit: { mode: "percent", value: "50" } }), true);
  assert.equal(accountAcceptanceHoldsConversion({ deposit: { mode: "amount", value: "1200.00" } }), true);
  // A deposit that would resolve to the whole amount is still the rep's
  // instruction to take the money on the quote — payQuote charges it correctly.
  assert.equal(accountAcceptanceHoldsConversion({ deposit: { mode: "percent", value: "100" } }), true);

  for (const attributes of [
    null,
    undefined,
    {},
    { test_mode: true },
    { deposit: null },
    { deposit: { mode: "percent", value: "0" } },
    { deposit: { mode: "bogus", value: "50" } },
    "not an object",
  ]) {
    assert.equal(accountAcceptanceHoldsConversion(attributes), false, JSON.stringify(attributes));
  }
});

test("a held deposit quote gets the unconverted call, so Pay this quote charges the deposit", () => {
  // The hold means no order id comes back from the portal follow-up.
  const call = proFormaPayCall({ ...CD, convertedOrderId: null, canPayByCard: true });
  assert.equal(call.label, "Pay this quote");
  assert.equal(call.href, "https://chefsdepot.com.au/account/quotes/42");
});

/**
 * WHERE THE VERB COMES FROM. The independent review of card isl1uwjR found the
 * first cut asked only the CHANNEL's method list — and Industry Kitchens' channel
 * has `stripe` enabled and not staff-only in production (channel_settings
 * payment_methods, read 2026-09-11), so the IK pro-forma said "Pay your order"
 * and "Sign in to your account to pay" about an order page with no card control.
 * The site's own answer is part of the question now.
 */
test("the channel offering cards is not enough — the SITE's order page must take one", () => {
  // Industry Kitchens as production has it: stripe on at checkout, no card control on the order page.
  assert.equal(
    proFormaCanPayByCard({ siteOffersOrderCardPayment: false, customerPaymentMethodIds: ["stripe", "bank_transfer"] }),
    false
  );
  // Chefs Depot: both.
  assert.equal(
    proFormaCanPayByCard({ siteOffersOrderCardPayment: true, customerPaymentMethodIds: ["stripe", "bank_transfer"] }),
    true
  );
  // A site that could take a card on a channel that has switched cards off.
  assert.equal(
    proFormaCanPayByCard({ siteOffersOrderCardPayment: true, customerPaymentMethodIds: ["bank_transfer"] }),
    false
  );
});

test("the Industry Kitchens pro-forma, as production would compose it, promises no card payment", () => {
  const call = proFormaPayCall({
    siteUrl: "https://industrykitchens.com.au",
    quoteId: 42,
    convertedOrderId: 154722,
    canPayByCard: proFormaCanPayByCard({
      siteOffersOrderCardPayment: false,
      customerPaymentMethodIds: ["stripe", "bank_transfer", "netterm"],
    }),
  });
  assert.equal(call.label, "View your order");
  assert.doesNotMatch(call.footer, /Sign in to your account to pay/);
  assert.match(call.footer, /invoice follows by email/);
});
