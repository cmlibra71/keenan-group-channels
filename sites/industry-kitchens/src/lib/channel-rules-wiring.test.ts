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
