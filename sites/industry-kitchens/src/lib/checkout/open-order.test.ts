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
};

test("looks the cart's order up BY cart uuid — no row window, one row back", async () => {
  const { client, calls } = fakeClient([order]);
  const found = await findOpenCardOrderForCart("cart-abc", 42, { client, channelId: 1 });
  assert.equal(found?.id, 90210);
  assert.equal(calls.length, 1);
  const q = calls[0].text;
  assert.match(q, /metafields ->> 'cart_uuid' = \?/);
  assert.match(q, /payment_status = 'awaiting_payment'/);
  assert.match(q, /ORDER BY id DESC\s+LIMIT 1/);
  assert.doesNotMatch(q, /LIMIT 20/);
  assert.deepEqual(calls[0].values.slice(0, 2), [1, "cart-abc"]);
  // Signed in: narrowed to THIS contact.
  assert.deepEqual(calls[0].values.slice(2), [42, 42]);
});

test("a guest's lookup is not narrowed to a contact; no uuid = no query", async () => {
  const { client, calls } = fakeClient([]);
  assert.equal(await findOpenCardOrderForCart("cart-xyz", null, { client, channelId: 1 }), null);
  assert.deepEqual(calls[0].values.slice(2), [null, null]);
  const empty = fakeClient([order]);
  assert.equal(await findOpenCardOrderForCart("", 42, { client: empty.client }), null);
  assert.equal(empty.calls.length, 0);
});

test("placeOrder uses the direct lookup, not a list window", () => {
  const src = readFileSync(path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../actions/checkout.ts"), "utf8");
  assert.match(src, /findOpenCardOrderForCart\(uuid, session\?\.contactId \?\? null\)/);
  const reuse = src.slice(src.indexOf("Idempotency guard for card payments"), src.indexOf("Create order — stamped with the CONTACT"));
  assert.doesNotMatch(reuse, /orderService\.list\(/);
  assert.doesNotMatch(reuse, /limit: 20/);
});
