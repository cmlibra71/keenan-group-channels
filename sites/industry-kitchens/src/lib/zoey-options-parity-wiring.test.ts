import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Source guard for the Industry-Kitchens-only Zoey options/bundles (owner decisions 8/9/10 and
 * Chris's IK-only rule, 2026-09-28). The groups and kits imported from Zoey live under
 * `metafields.channel_addons[<channel>]` / `metafields.channel_kits[<channel>]`, and they reach a
 * shopper ONLY where a reader names this storefront's CHANNEL_ID. A reader that forgets is silent:
 * the question is not asked, the surcharge is not charged, the bundle is not offered. So every
 * reader on the buying path is pinned here.
 */
const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");

test("every storefront addon reader names this channel", () => {
  for (const rel of [
    "app/products/[slug]/page.tsx",
    "lib/actions/cart.ts",
    "lib/actions/quote.ts",
    "lib/actions/checkout.ts",
    "lib/checkout/account-prices.ts",
  ]) {
    const src = read(rel);
    const calls = src.match(/readProductAddons\([^)]*\)/g) ?? [];
    assert.ok(calls.length > 0, `${rel} reads addons`);
    for (const call of calls) assert.match(call, /channelId: CHANNEL_ID/, `${rel}: ${call}`);
  }
});

test("every kit reader on the buying path names this channel", () => {
  for (const rel of ["app/products/[slug]/page.tsx", "lib/actions/quote.ts"]) {
    const calls = read(rel).match(/readProductKit\([^)]*\)/g) ?? [];
    assert.ok(calls.length > 0, rel);
    for (const call of calls) assert.match(call, /CHANNEL_ID/, `${rel}: ${call}`);
  }
});

test("a tile add records the pre-selected answers instead of arriving bare", () => {
  assert.match(read("lib/actions/cart.ts"), /resolveAddonSelection\(buyable, posted \? selection : \{\}\)/);
  const quote = read("lib/actions/quote.ts");
  assert.match(quote, /tileDefaultAddons = addonsPosted \? \[\] : resolveAddonSelection\(addonDefinition, \{\}\)/);
  assert.match(quote, /resolveKitChoices\(kit, kitFromTile \? tileKitChoices\(kit\) : kitChoices\)/);
});

test("a quote-only scoped bundle has no Add to Cart, on the page and in the cart action", () => {
  assert.match(read("app/products/[slug]/page.tsx"), /readProductKit\(product\.metafields, CHANNEL_ID\)\?\.quoteOnly === true/);
  assert.match(read("builder/BuilderProductPage.tsx"), /kitQuoteOnly \? \{ restrictAddToCart: true \}/);
  assert.match(read("lib/cart/backorder-facts.ts"), /'channel_kits' -> \$\{String\(CHANNEL_ID\)\} ->> 'quote_only'/);
});

test("the SilverChef panel rents the finance amounts (freight extras excluded)", () => {
  const src = read("components/product/SilverChefPanel.tsx");
  assert.match(src, /purchase\.financeDisplayPrice \?\? purchase\.displayPrice/);
  assert.match(src, /purchase\.financeMemberPrice/);
});
