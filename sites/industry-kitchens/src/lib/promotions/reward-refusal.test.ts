import { test } from "node:test";
import assert from "node:assert/strict";

// Loaded lazily: `lib/channel` reads CHANNEL_ID when the module is first imported.
process.env.CHANNEL_ID ??= "1";
type Mod = typeof import("./reward-refusal.ts");
const refusedRewardProductIds: Mod["refusedRewardProductIds"] = async (...args) =>
  (await import("./reward-refusal.ts")).refusedRewardProductIds(...args);
const withoutRefusedRewards: Mod["withoutRefusedRewards"] = async (...args) =>
  (await import("./reward-refusal.ts")).withoutRefusedRewards(...args);

// Card EIXdjw2s, review round 3: an auto-added reward the cart would refuse is neither added nor
// kept, and a lookup that fails refuses nothing.

const facts = (rows: Record<number, Record<string, unknown>>) => async (ids: number[]) =>
  new Map(ids.filter((id) => rows[id]).map((id) => [id, rows[id] as never]));
const resolve = (rows: Record<string, number>) => async (skus: string[]) =>
  new Map(
    skus
      .map((s) => s.toUpperCase())
      .filter((s) => rows[s] != null)
      .map((s) => [s, { productId: rows[s], variantId: null }] as const)
  );

const SPRAY = { sku: "SC-BSTESBR750", promotionId: 188, quantity: 1 };
const TROLLEY = { sku: "TROLLEY-B", promotionId: 190, quantity: 2 };

test("a reward whose product Zoey flipped to cart disabled is dropped; a sellable one stays", async () => {
  const deps = {
    resolve: resolve({ "SC-BSTESBR750": 11, "TROLLEY-B": 22 }),
    facts: facts({ 11: { restrictAddToCart: true }, 22: {} }),
  };
  assert.deepEqual(await withoutRefusedRewards([SPRAY, TROLLEY], { loggedIn: true }, deps), [TROLLEY]);
});

test("a deny-policy reward short of the units it gives is dropped", async () => {
  const deps = {
    resolve: resolve({ "TROLLEY-B": 22 }),
    facts: facts({ 22: { inventoryTracking: "product", inventoryLevel: 1, backorderPolicy: "deny" } }),
  };
  assert.deepEqual(await withoutRefusedRewards([TROLLEY], null, deps), []);
  assert.deepEqual(await refusedRewardProductIds([{ productId: 22, quantity: 1 }], null, deps), new Set());
});

test("a lookup that fails refuses nothing, and an unresolved SKU is kept for the add path to judge", async () => {
  const boom = async () => {
    throw new Error("db down");
  };
  assert.deepEqual(await withoutRefusedRewards([SPRAY], null, { resolve: boom }), [SPRAY]);
  assert.deepEqual(
    await withoutRefusedRewards([SPRAY], null, { resolve: resolve({ "SC-BSTESBR750": 11 }), facts: boom }),
    [SPRAY]
  );
  assert.deepEqual(await withoutRefusedRewards([SPRAY], null, { resolve: resolve({}), facts: facts({}) }), [SPRAY]);
});

test("nothing wanted costs no lookup", async () => {
  let asked = 0;
  const deps = {
    resolve: async () => {
      asked++;
      return new Map();
    },
  };
  assert.deepEqual(await withoutRefusedRewards([], null, deps), []);
  assert.deepEqual(await withoutRefusedRewards([{ ...SPRAY, quantity: 0 }], null, deps), [{ ...SPRAY, quantity: 0 }]);
  assert.equal(asked, 0);
});

test("the guest quote-only rule refuses a guest's reward, not a signed-in shopper's", async () => {
  const deps = {
    facts: facts({ 11: { channelRules: { quoteOnly: false, guestQuoteOnly: true, outOfStock: false } } }),
  };
  assert.deepEqual(await refusedRewardProductIds([{ productId: 11, quantity: 1 }], { loggedIn: false }, deps), new Set([11]));
  assert.deepEqual(await refusedRewardProductIds([{ productId: 11, quantity: 1 }], { loggedIn: true }, deps), new Set());
});
