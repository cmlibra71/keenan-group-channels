import { test } from "node:test";
import assert from "node:assert/strict";
import { onlineOrderingOff } from "./online-purchase.ts";

// The cart + checkout guard reads the SAME effective rules as the page: Zoey's value unless staff
// overrode it in the portal (`metafields.channel_rule_overrides`, override ?? zoey per rule). These
// run rows through `backorderFactsForProducts` itself and then through `onlineOrderingOff` — the
// exact pair `addToCart` and checkout's re-check call (lib/actions/cart.ts, lib/actions/checkout.ts).
process.env.CHANNEL_ID ??= "1";
// Loaded lazily: `@/lib/channel` reads CHANNEL_ID when the module is first imported.
type Facts = typeof import("./backorder-facts.ts");
const backorderFactsForProducts: Facts["backorderFactsForProducts"] = async (...args) =>
  (await import("./backorder-facts.ts")).backorderFactsForProducts(...args);

const IK = 1;
const CD = 2;
const GUEST = { loggedIn: false };
const SIGNED_IN = { loggedIn: true };

type Rules = Partial<Record<"quote_only" | "guest_quote_only" | "out_of_stock" | "search_only", unknown>>;
const row = (id: number, zoey: Rules | null, overrides: Rules | null, channel = "1") => ({
  id,
  inventory_tracking: "none",
  inventory_level: null,
  backorder_policy: null,
  restrict_add_to_cart: false,
  kit_quote_only: false,
  purchasing_disabled: false,
  purchasing_disabled_message: null,
  hide_price: false,
  sell_pack_size: null,
  sell_pack_unit: null,
  // The SELECT returns the two whole bags; the reader scopes them to the channel.
  zoey_channel_rules: zoey ? { [channel]: { quote_only: false, guest_quote_only: false, out_of_stock: false, search_only: false, ...zoey } } : null,
  channel_rule_overrides: overrides ? { [channel]: overrides } : null,
});

/** A postgres-js stand-in: records the query text and answers with the given rows. */
function fakeClient(rows: unknown[]) {
  const seen: string[] = [];
  const client = (strings: TemplateStringsArray) => {
    seen.push(strings.join("?"));
    return Promise.resolve(rows);
  };
  return { client, seen };
}

async function refused(r: ReturnType<typeof row>, viewer: { loggedIn: boolean }, channelId = IK) {
  const { client } = fakeClient([r]);
  const facts = await backorderFactsForProducts([r.id], { client, channelId });
  return onlineOrderingOff(facts.get(r.id), viewer);
}

test("the guard's query selects the staff overrides beside Zoey's rules", async () => {
  const { client, seen } = fakeClient([]);
  await backorderFactsForProducts([1], { client, channelId: IK });
  assert.match(seen[0], /metafields -> 'zoey_channel_rules' AS zoey_channel_rules/);
  assert.match(seen[0], /metafields -> 'channel_rule_overrides' AS channel_rule_overrides/);
});

test("Force OFF quote_only: Zoey says quote only, staff allow the cart — add + checkout allowed", async () => {
  const r = row(10, { quote_only: true }, { quote_only: false });
  assert.equal(await refused(r, GUEST), false);
  assert.equal(await refused(r, SIGNED_IN), false);
  // Without the override the same row is refused (today's behaviour is unchanged).
  assert.equal(await refused(row(10, { quote_only: true }, null), SIGNED_IN), true);
});

test("Force ON out_of_stock / quote_only: refused for everyone", async () => {
  for (const rule of ["out_of_stock", "quote_only"] as const) {
    const r = row(11, {}, { [rule]: true });
    assert.equal(await refused(r, GUEST), true, rule);
    assert.equal(await refused(r, SIGNED_IN), true, rule);
  }
  // Even with no Zoey bag at all.
  assert.equal(await refused(row(12, null, { out_of_stock: true }), SIGNED_IN), true);
});

test("Force ON guest_quote_only: a guest is refused, a signed-in customer buys", async () => {
  const r = row(13, {}, { guest_quote_only: true });
  assert.equal(await refused(r, GUEST), true);
  assert.equal(await refused(r, SIGNED_IN), false);
});

test("Follow Zoey (no override) and junk override values keep Zoey's rule", async () => {
  assert.equal(await refused(row(14, { out_of_stock: true }, {}), SIGNED_IN), true);
  assert.equal(await refused(row(15, { out_of_stock: true }, { out_of_stock: "maybe" }), SIGNED_IN), true);
  assert.equal(await refused(row(16, {}, { quote_only: null }), SIGNED_IN), false);
});

test("Chefs Depot is untouched: rules or overrides keyed to another channel never refuse its cart", async () => {
  assert.equal(await refused(row(17, { quote_only: true }, { out_of_stock: true }, "1"), SIGNED_IN, CD), false);
  // An override stored under channel 2 (only a raw API write could) is ignored.
  assert.equal(await refused(row(18, null, { quote_only: true }, "2"), SIGNED_IN, CD), false);
});

// The same through the REAL query against commerce_test (rolled back), when it is configured.
const TEST_URL = process.env.COMMERCE_TEST_DATABASE_URL;
test("real query (commerce_test, rolled back): override rows through backorderFactsForProducts", { skip: TEST_URL && /commerce_test/.test(TEST_URL) ? false : "COMMERCE_TEST_DATABASE_URL not set" }, async () => {
  const { default: postgres } = await import("postgres");
  const sql = postgres(TEST_URL!, { prepare: false, max: 1, onnotice: () => {} });
  class Rollback extends Error {}
  try {
    await sql.begin(async (tx) => {
      const mk = async (sku: string, metafields: unknown) =>
        Number((await tx`INSERT INTO products (name, sku, price, metafields) VALUES (${sku}, ${sku}, 10, ${JSON.stringify(metafields)}::text::jsonb) RETURNING id`)[0].id);
      const off = await mk("ITEST-BOF-OFF", { zoey_channel_rules: { "1": { quote_only: true } }, channel_rule_overrides: { "1": { quote_only: false } } });
      const oos = await mk("ITEST-BOF-OOS", { zoey_channel_rules: { "1": { out_of_stock: false } }, channel_rule_overrides: { "1": { out_of_stock: true } } });
      const guest = await mk("ITEST-BOF-GQ", { channel_rule_overrides: { "1": { guest_quote_only: true } } });
      const client = tx as unknown as Parameters<typeof backorderFactsForProducts>[1] extends infer D ? D extends { client?: infer C } ? C : never : never;
      const facts = await backorderFactsForProducts([off, oos, guest], { client, channelId: IK });
      assert.equal(onlineOrderingOff(facts.get(off), SIGNED_IN), false);
      assert.equal(onlineOrderingOff(facts.get(oos), SIGNED_IN), true);
      assert.equal(onlineOrderingOff(facts.get(guest), GUEST), true);
      assert.equal(onlineOrderingOff(facts.get(guest), SIGNED_IN), false);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  } finally {
    await sql.end();
  }
});

// THIS storefront's own Zoey pack (`metafields.zoey_channel_pack[CHANNEL_ID]`): the query scopes it
// to the channel being served, so Chefs Depot's cart never receives Industry Kitchens' entry.
test("the guard's query reads the pack entry scoped to THIS channel", async () => {
  const { client, seen } = fakeClient([]);
  await backorderFactsForProducts([1], { client, channelId: IK });
  assert.match(seen[0], /metafields -> 'zoey_channel_pack' -> \? AS channel_pack/);
});

test("a channel pack sells by the carton where no shared pack is set; a shared pack wins", async () => {
  const entry = { sell_pack_size: 12, sell_pack_unit: "Carton", qty_packaging_enabled: true, qty_unit_label: null };
  const withPack = { ...row(7, null, null), channel_pack: entry };
  const facts = (await backorderFactsForProducts([7], { client: fakeClient([withPack]).client, channelId: IK })).get(7);
  assert.equal(facts?.sellPackSize, 12);
  assert.equal(facts?.sellPackUnit, "Carton");
  const shared = { ...row(8, null, null), sell_pack_size: 6, sell_pack_unit: "Box", channel_pack: entry };
  const sharedFacts = (await backorderFactsForProducts([8], { client: fakeClient([shared]).client, channelId: IK })).get(8);
  assert.equal(sharedFacts?.sellPackSize, 6);
  // no entry for the channel (Chefs Depot): the shared columns, exactly as before
  const none = (await backorderFactsForProducts([9], { client: fakeClient([{ ...row(9, null, null), channel_pack: null }]).client, channelId: CD })).get(9);
  assert.equal(none?.sellPackSize, null);
});

test("Zoey's multiples of N (Packaging off) reaches the cart as a pieces rule, not a carton", async () => {
  const entry = { sell_pack_size: 8, sell_pack_unit: null, qty_packaging_enabled: false, qty_unit_label: "Pcs" };
  const r = { ...row(11, null, null), qty_packaging_enabled: null, channel_pack: entry };
  const facts = (await backorderFactsForProducts([11], { client: fakeClient([r]).client, channelId: IK })).get(11);
  assert.equal(facts?.sellPackSize, 8);
  assert.equal(facts?.qtyPackagingEnabled, false);
});
