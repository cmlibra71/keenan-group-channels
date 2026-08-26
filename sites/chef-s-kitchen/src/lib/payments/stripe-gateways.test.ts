import { test } from "node:test";
import assert from "node:assert/strict";
import { cardConfirmParams, canTakeCardPayment } from "./stripe-gateways.ts";


/**
 * Card b88eIfaS — the confirm half. Radar reads the customer's name, email and
 * billing address off the payment method's billing_details, and we sent none.
 */
test("the confirmed card carries the buyer's name, email and billing address", () => {
  const card = { fake: "card-element" };
  const params = cardConfirmParams(card, {
    name: "Fiona Robinson",
    email: "fiona@example.com",
    address: { line1: "12 Smith St", city: "Collingwood", state: "VIC", postal_code: "3066", country: "AU" },
  });
  assert.equal(params.payment_method.card, card);
  assert.equal(params.payment_method.billing_details?.name, "Fiona Robinson");
  assert.equal(params.payment_method.billing_details?.email, "fiona@example.com");
  assert.equal(params.payment_method.billing_details?.address?.postal_code, "3066");
});

test("nothing to say means nothing is sent, and the card still confirms", () => {
  const card = { fake: "card-element" };
  assert.deepEqual(cardConfirmParams(card, null), { payment_method: { card } });
  assert.deepEqual(cardConfirmParams(card, {}), { payment_method: { card } });
  assert.deepEqual(cardConfirmParams(card, undefined), { payment_method: { card } });
});


// ---------------------------------------------------------------------------
// canTakeCardPayment — card OHDx84DK
//
// ONE predicate, called by the checkout PAGE (what to render) and by placeOrder
// (what to accept). `placeOrder` writes the order row before it calls Stripe, so
// a page and an action that disagree here leave a numbered, unpaid order behind.
// ---------------------------------------------------------------------------

const creds = (c: Record<string, string>) => ({ credentials: c });

test("both keys present means the storefront can take a card", () => {
  assert.equal(canTakeCardPayment(creds({ publishable_key: "pk_live_x", secret_key: "sk_live_x" })), true);
});

test("no resolved gateway at all means no card", () => {
  // The live-mode refusal: a channel holds entries but none is live, so
  // selectChannelGateway returns null rather than borrowing the shared account.
  assert.equal(canTakeCardPayment(null), false);
  assert.equal(canTakeCardPayment(undefined), false);
  assert.equal(canTakeCardPayment({ credentials: null }), false);
});

test("HALF a credential set is not a card payment", () => {
  // Elements needs the publishable key; the intent needs the secret key. Either
  // one missing takes no money, so the option must not be offered.
  assert.equal(canTakeCardPayment(creds({ publishable_key: "pk_live_x" })), false);
  assert.equal(canTakeCardPayment(creds({ secret_key: "sk_live_x" })), false);
  assert.equal(canTakeCardPayment(creds({})), false);
});

test("whitespace is not a key", () => {
  // A pasted-then-cleared field stores "" or "   "; neither authenticates.
  assert.equal(canTakeCardPayment(creds({ publishable_key: "   ", secret_key: "sk_live_x" })), false);
  assert.equal(canTakeCardPayment(creds({ publishable_key: "pk_live_x", secret_key: "" })), false);
});
