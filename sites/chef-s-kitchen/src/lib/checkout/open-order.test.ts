import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { OpenCardOrder } from "./open-order";

process.env.CHANNEL_ID ??= "1";
// Loaded lazily: `lib/channel` reads CHANNEL_ID when the module is first imported.
const findOpenCardOrderForCart = async (...args: Parameters<typeof import("./open-order").findOpenCardOrderForCart>) =>
  (await import("./open-order")).findOpenCardOrderForCart(...args);

/** A fake postgres-js client: records the query and returns canned rows. */
function fakeClient(rows: OpenCardOrder[]) {
  const calls: { text: string; values: unknown[] }[] = [];
  const client = (strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ text: strings.join("?"), values });
    return Promise.resolve(rows as unknown[]);
  };
  return { client, calls };
}

const order: OpenCardOrder = {
  id: 90210,
  order_number: "IK-90210",
  customer_po: null,
  metafields: { cart_uuid: "cart-abc" },
  total_inc_tax: "7548.7500",
  payment_provider_id: "pi_123",
  contact_id: 42,
};

test("looks the cart's order up BY cart uuid — no row window, one row back", async () => {
  const { client, calls } = fakeClient([order]);
  const found = await findOpenCardOrderForCart("cart-abc", 42, "chef@example.com", { client, channelId: 1 });
  assert.equal(found?.id, 90210);
  assert.equal(calls.length, 1);
  const q = calls[0].text;
  assert.match(q, /metafields ->> 'cart_uuid' = \?/);
  // Never a dead order.
  assert.match(q, /NOT IN \('canceled', 'cancelled', 'voided'\)/);
  assert.match(q, /payment_status = 'awaiting_payment'/);
  assert.match(q, /id DESC\s+LIMIT 1/);
  assert.doesNotMatch(q, /LIMIT 20/);
  assert.deepEqual(calls[0].values.slice(0, 2), [1, "cart-abc"]);
  // Signed in: THIS contact (or no contact, or their passwordless guest contact by email).
  assert.deepEqual(calls[0].values.slice(2, 4), [42, 42]);
});

test("a guest's lookup is not narrowed to a contact; no uuid = no query", async () => {
  const { client, calls } = fakeClient([]);
  assert.equal(await findOpenCardOrderForCart("cart-xyz", null, null, { client, channelId: 1 }), null);
  assert.deepEqual(calls[0].values.slice(2, 4), [null, null]);
  const empty = fakeClient([order]);
  assert.equal(await findOpenCardOrderForCart("", 42, null, { client: empty.client }), null);
  assert.equal(empty.calls.length, 0);
});

test("placeOrder uses the direct lookup, not a list window", () => {
  const src = readFileSync(path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../actions/checkout.ts"), "utf8");
  assert.match(src, /findOpenCardOrderForCart\(uuid, session\?\.contactId \?\? null, session\?\.email \?\? null\)/);
  const reuse = src.slice(src.indexOf("Idempotency guard for card payments"), src.indexOf("Create order — stamped with the CONTACT"));
  assert.doesNotMatch(reuse, /orderService\.list\(/);
  assert.doesNotMatch(reuse, /limit: 20/);
});

test("guest then sign in: a signed-in lookup also matches the cart's GUEST order (no contact), own order first", async () => {
  const { client, calls } = fakeClient([{ ...order, contact_id: null }]);
  const found = await findOpenCardOrderForCart("cart-abc", 42, "chef@example.com", { client, channelId: 1 });
  assert.equal(found?.contact_id, null);
  const q = calls[0].text;
  // THEIR contact, or no contact — never another person's.
  assert.match(q, /OR contact_id = \?::int\s+OR contact_id IS NULL/);
  // Own order first.
  assert.match(q, /ORDER BY \(contact_id IS NOT DISTINCT FROM \?::int\) DESC, id DESC/);
});

test("placeOrder claims a reused guest order for the signed-in shopper; a re-priced one is replaced first", () => {
  const src = readFileSync(path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../actions/checkout.ts"), "utf8");
  const replace = src.indexOf("decideOpenOrderReuse(openForCart.total_inc_tax, totalIncTax)");
  const claim = src.indexOf("session?.contactId && existing.contact_id !== session.contactId");
  const intent = src.indexOf("paymentService.createStripePaymentIntent(existing.id");
  assert.ok(replace !== -1 && claim !== -1 && intent !== -1);
  assert.ok(replace < claim && claim < intent, "claim after the reuse decision, before the intent");
  assert.match(src.slice(claim, intent), /contactId: session\.contactId/);
});

test("a signed-in retry also matches the PASSWORDLESS guest-checkout contact for their email — never a login", async () => {
  const { client, calls } = fakeClient([{ ...order, contact_id: 777 }]);
  const found = await findOpenCardOrderForCart("cart-abc", 42, "Chef@Example.com", { client, channelId: 1 });
  assert.equal(found?.contact_id, 777);
  const q = calls[0].text;
  assert.match(q, /g\.password_hash IS NULL AND g\.account_id IS NULL/);
  assert.match(q, /g\.origin_channel_id = \?/);
  assert.match(q, /lower\(g\.email\) = lower\(\?::text\)/);
  assert.ok(calls[0].values.includes("Chef@Example.com"));
  // A guest (no email) never reaches the email clause's contact lookup with a value.
  const guest = fakeClient([]);
  await findOpenCardOrderForCart("cart-abc", null, null, { client: guest.client, channelId: 1 });
  assert.equal(guest.calls[0].values.filter((v) => v === "Chef@Example.com").length, 0);
});

test("a reused open order is refreshed with THIS checkout's billing + delivery address, before the intent", () => {
  const src = readFileSync(path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../actions/checkout.ts"), "utf8");
  const decide = src.indexOf("decideOpenOrderReuse(openForCart.total_inc_tax, totalIncTax)");
  const billing = src.indexOf("await orderService.update(existing.id, { billingAddress })");
  const ship = src.indexOf("orderShippingAddressService.updateForParent(existing.id, shipRows[0].id, shippingAddressRow())");
  const intent = src.indexOf("paymentService.createStripePaymentIntent(existing.id");
  assert.ok(decide !== -1 && billing !== -1 && ship !== -1 && intent !== -1);
  assert.ok(decide < billing && billing < ship && ship < intent);
  // The fresh order and the reused order write the delivery row from the SAME builder.
  assert.match(src, /orderShippingAddressService\.createForParent\(order\.id, shippingAddressRow\(\)\)/);
});
