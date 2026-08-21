import { test } from "node:test";
import assert from "node:assert/strict";
import {
  enabledStripeGateways,
  cardConfirmParams,
  type StripeGatewayEntry,
} from "./stripe-gateways.ts";

const g = (over: Partial<StripeGatewayEntry>): StripeGatewayEntry => ({
  provider: "stripe",
  credentials: { secret_key: "sk", publishable_key: "pk" },
  ...over,
});

test("keeps stripe entries that are not explicitly disabled", () => {
  assert.equal(enabledStripeGateways([g({}), g({ enabled: true })]).length, 2);
});

test("drops non-stripe providers", () => {
  const r = enabledStripeGateways([g({}), g({ provider: "paypal" })]);
  assert.equal(r.length, 1);
  assert.equal(r[0].provider, "stripe");
});

test("drops explicitly disabled stripe entries (enabled === false)", () => {
  const r = enabledStripeGateways([g({ enabled: false }), g({ enabled: true })]);
  assert.equal(r.length, 1);
  assert.equal(r[0].enabled, true);
});

test("empty in, empty out", () => {
  assert.deepEqual(enabledStripeGateways([]), []);
});

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
