import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * SOURCE GUARD — a bundle quoted from the storefront carries only the parts the page priced
 * (card Tc5ekvD6, review 2026-09-25).
 *
 * The page and the cart decide which parts are buyable through `priceKitComponents` (sold on THIS
 * storefront, visible, not deleted, price not hidden, not cart-restricted, above $0). Add to Quote
 * used a looser test (catalogue scope + restrict_add_to_quote only), so a retired or other-site
 * part the page showed unpriced still landed on the customer's quote at its catalogue price — on
 * Chefs Depot, possibly a product only Industry Kitchens sells — and a soft-deleted part made
 * `productService.getById` throw inside the action. Both are about WIRING in a server action
 * against the live database, which a pure-function test cannot see, so this pins the source:
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const quote = strip(readFileSync(path.join(here, "quote.ts"), "utf8"));
const fn = quote.slice(quote.indexOf("async function priceBundlePartsForQuote"));
const body = fn.slice(0, fn.indexOf("\nexport "));

test("the quote's part check is the page's and the cart's own test, run before any part is read", () => {
  const check = body.indexOf("unbuyableBundlePart(parts, await priceKitComponents(kit))");
  assert.ok(check > -1, "priceBundlePartsForQuote must refuse any part priceKitComponents would not price");
  assert.ok(check < body.indexOf("for (const part of parts)"), "the check must come before the per-part reads");
  assert.match(body, /if \(unbuyable\) return \{ error: refusal\(unbuyable\) \}/);
});

test("a part that cannot be read is a worded refusal naming it, never a crash", () => {
  assert.match(body, /try \{\s*row = \(await productService\.getById\(part\.productId\)\)/);
  assert.match(body, /catch \{\s*return \{ error: refusal\(part\) \};/);
  assert.match(body, /`\$\{part\.name\} can't be added to a quote online\./);
});

test("the parts are checked BEFORE the quote is created or written", () => {
  const add = quote.slice(quote.indexOf("export async function addToQuote"));
  const priced = add.indexOf("priceBundlePartsForQuote(kit, bundlePartsToWrite, suppress)");
  assert.ok(priced > -1);
  assert.ok(priced < add.indexOf("getOrCreateQuote()"), "a refused build must leave the quote untouched");
});
