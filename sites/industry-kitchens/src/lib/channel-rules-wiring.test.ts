import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// This storefront's Zoey rules (portal PR #1028) on the SEARCH surfaces — the behaviour itself is
// unit-tested in services (`applyChannelRulesToTileRows`); these pin that both search paths and the
// suggestion endpoint apply it, and that the product-page fallbacks refuse the cart from metafields.
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

test("search results (Meilisearch + Postgres fallback) apply the channel rules", () => {
  const src = read("app/search/search-query.ts");
  assert.match(src, /const rulesById = await getChannelRulesForProducts\(result\.hits\.map/);
  assert.match(src, /products: rulesById\.size > 0 \? await withChannelRules\(mapped, rulesById\) : mapped/);
  assert.match(src, /const products = await withChannelRules\(rows as unknown as SearchProduct\[\]\)/);
});

test("the suggestion endpoint applies them before narrowing to public fields", () => {
  const src = read("app/api/search/route.ts");
  const apply = src.indexOf("applyChannelRulesToTileRows(result.hits");
  const narrow = src.indexOf("result.hits.map(toPublicHit)");
  assert.ok(apply > 0 && narrow > apply);
});

test("the fallback product renderers refuse the cart from the channel rules (out-of-stock + guest)", () => {
  assert.match(read("app/products/[slug]/page.tsx"), /\(await channelRulesRefuseCartFor\(product\)\)/);
  assert.equal(read("blocks/product-blocks.tsx").match(/channelRulesRefuseCartFor\(product\)/g)?.length, 2);
  assert.match(read("lib/product/channel-rule-cart.ts"), /channelRulesOfRow\(product, CHANNEL_ID\)/);
  assert.match(read("blocks/widgets-server.tsx"), /products = applyChannelRulesToTileRows\(products, \{ viewer \}\)/);
});

test("rows handed to CLIENT components have the rules applied and the raw rules object removed", () => {
  // Category + brand node branches (shared): the client wrapper (grid, load more, GA4) gets clientRows.
  const cat = read("builder/category-node-branch.tsx");
  assert.match(cat, /const clientRows = applyChannelRulesToTileRows\(scoped, \{/);
  assert.match(cat, /products: clientRows,/);
  const brand = read("builder/brand-node-branch.tsx");
  assert.match(brand, /const clientRows = applyChannelRulesToTileRows\(scoped, \{/);
  assert.match(brand, /products=\{clientRows\}/);
  // Home carousels (client ProductGridClient / ClearanceSpotlight).
  assert.match(read("builder/home-data.ts"), /const scoped = applyChannelRulesToTileRows\(overlaid, \{ viewer \}\)/);
});

test("the product page hands the client natives only the kit — no product row, no metafields", () => {
  const src = read("app/products/[slug]/page.tsx");
  const bag = src.slice(src.indexOf("nativeData: {"), src.indexOf("},", src.indexOf("nativeData: {")));
  assert.match(bag, /kit: readProductKit\(product\.metafields, CHANNEL_ID\)/);
  assert.doesNotMatch(bag, /purchaseProduct|customFields|metafields as/);
});

test("the cart and checkout guards judge the EFFECTIVE rules (staff overrides included)", () => {
  // backorderFactsForProducts reads both bags and scopes them with the services reader
  // (lib/cart/backorder-facts.test.ts drives it with override rows).
  const facts = read("lib/cart/backorder-facts.ts");
  assert.match(facts, /metafields -> 'channel_rule_overrides' AS channel_rule_overrides/);
  assert.match(facts, /channelRules: readChannelRules\(/);
  assert.doesNotMatch(facts, /parseChannelRules\(row\./);
  // Checkout's re-check runs those facts through onlineOrderingOff with who is placing the order.
  const checkout = read("lib/actions/checkout.ts");
  assert.match(checkout, /const stock = await backorderFactsForProducts\(/);
  assert.match(checkout, /onlineOrderingOff\(stock\.get\(i\.product_id\), \{ loggedIn: session != null \}\)/);
  // Add to cart reads the same facts.
  assert.match(read("lib/actions/cart.ts"), /await backorderFactsForProduct\(productId\)/);
});
