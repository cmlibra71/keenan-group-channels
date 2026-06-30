import { test } from "node:test";
import assert from "node:assert/strict";
import { enabledStripeGateways, type StripeGatewayEntry } from "./stripe-gateways.ts";

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
