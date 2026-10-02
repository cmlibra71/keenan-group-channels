import { test } from "node:test";
import assert from "node:assert/strict";
import { chargedUnitPrice, onlineOrderingOff, refuseOnlinePurchase } from "./online-purchase.ts";
import { readChannelRules } from "@keenan/services/channel-rules";
import { CART_RESTRICTED_ERROR } from "./restricted-message.ts";

test("an ordinary priced product may be bought online", () => {
  assert.equal(refuseOnlinePurchase({}, 2514.68), null);
  assert.equal(refuseOnlinePurchase(null, 10), null);
  assert.equal(
    refuseOnlinePurchase(
      { restrictAddToCart: false, purchasingDisabled: false, hidePrice: false, variantPurchasingDisabled: false },
      10
    ),
    null
  );
});

test("each quote-only flag refuses the add with the cart's own sentence", () => {
  for (const flags of [
    { restrictAddToCart: true },
    { purchasingDisabled: true },
    { hidePrice: true },
    { variantPurchasingDisabled: true },
  ]) {
    assert.equal(refuseOnlinePurchase(flags, 999), CART_RESTRICTED_ERROR, JSON.stringify(flags));
    assert.equal(onlineOrderingOff(flags), true);
  }
});

test("a Zoey quote-only product is refused with the page's own sentence", () => {
  assert.equal(refuseOnlinePurchase({}, 999, "This item is available by quote only"), "This item is available by quote only");
  assert.equal(refuseOnlinePurchase({ purchasingDisabled: true }, 999, "Call us for a price"), "Call us for a price");
  // No message (purchasing on) falls through to the other rules.
  assert.equal(refuseOnlinePurchase({}, 999, null), null);
  assert.equal(refuseOnlinePurchase({}, 999, "  "), null);
});

test("a product with no price sells by quote only — $0, negative, blank or NaN", () => {
  for (const price of [0, -1, NaN, null, undefined]) {
    assert.equal(refuseOnlinePurchase({}, price as number), CART_RESTRICTED_ERROR, String(price));
  }
});

test("the charged unit is the sale price when there is one, else the list price", () => {
  assert.equal(chargedUnitPrice({ listPrice: "3996.0000", salePrice: "2514.6800" }), 2514.68);
  assert.equal(chargedUnitPrice({ listPrice: "3996.0000", salePrice: null }), 3996);
  assert.equal(chargedUnitPrice({ listPrice: "0.0000", salePrice: null }), 0);
  assert.equal(chargedUnitPrice({ listPrice: "abc", salePrice: "" }), 0);
});

test("unflagged facts do not switch online ordering off", () => {
  assert.equal(onlineOrderingOff(null), false);
  assert.equal(onlineOrderingOff({ restrictAddToCart: false, purchasingDisabled: null }), false);
});

// Wiring: the refusal only matters if the server actions actually call it.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LIB = join(dirname(fileURLToPath(import.meta.url)), "..");

test("addToCart refuses quote-only products BEFORE the extras are priced on", () => {
  const src = readFileSync(join(LIB, "actions/cart.ts"), "utf8");
  const refuse = src.indexOf("refuseOnlinePurchase(");
  const surcharge = src.indexOf("const pricing = withAddonSurcharge(basePricing");
  assert.ok(refuse > 0, "addToCart calls refuseOnlinePurchase");
  assert.ok(surcharge > refuse, "the refusal is judged on the price before extras");
  // ONE exception (owner decision 2026-09-30): a $0 IK product sold through its required, priced
  // Zoey option is judged at base + that answer — and ONLY when the services predicate says so.
  assert.match(
    src,
    /const judgedUnitPrice = soldByRequiredOption\(requiredDefinition\)\s*\? chargedUnitPrice\(basePricing\) \+ requiredChoicePrice\(requiredDefinition, resolvedAddons\)\s*: chargedUnitPrice\(basePricing\);/
  );
  // …judged on the REQUIRED choice only: no whole-selection surcharge feeds the refusal.
  assert.doesNotMatch(src, /refuseOnlinePurchase\([^)]*withAddonSurcharge/);
  assert.match(src, /if \(onlineOrderingOff\(facts, viewer\)\) return CART_RESTRICTED_ERROR;/);
  // Product OR variant quote-only, through the services helper.
  assert.match(src, /purchasingDisabledMessage\(facts, variantRow\)/);
  // The cart charges the page's catalogue price.
  assert.match(src, /catalogLinePrices\(product, variant(, \{ parentPrice: parentPriced \})?\)/);
});

test("placeOrder refuses a line whose product is quote-only", () => {
  const src = readFileSync(join(LIB, "actions/checkout.ts"), "utf8");
  // …judged for the shopper placing it (the Zoey guest quote-only rule reads the session).
  assert.match(
    src,
    /lines\.find\(\(i\) =>\s*onlineOrderingOff\(stock\.get\(i\.product_id\), \{ loggedIn: session != null \}\)\s*\)/
  );
});

test("the facts read carries both quote-only switches", () => {
  const src = readFileSync(join(LIB, "cart/backorder-facts.ts"), "utf8");
  assert.match(src, /purchasing_disabled, purchasing_disabled_message, hide_price/);
});

// ── This storefront's Zoey rules (`metafields.zoey_channel_rules[CHANNEL_ID]`, portal PR #1028) ──
// The facts read parses the CHANNEL's key only (`backorder-facts.ts`), so these flags are what the
// guard sees on Industry Kitchens (key "1"); on Chefs Depot the same product reads as no rules.

/** A metafields bag as the portal importer writes it (IK key only). */
const zoeyBag = (rules: Record<string, boolean>) => ({ zoey_channel_rules: { "1": rules } });
const IK_RULES = (rules: Record<string, boolean>) => readChannelRules(zoeyBag(rules), 1);
const CD_RULES = (rules: Record<string, boolean>) => readChannelRules(zoeyBag(rules), 2);
const GUEST = { loggedIn: false };
const SIGNED_IN = { loggedIn: true };

test("zero-price (quote_only) refuses Add to Basket for everyone, with the restricted sentence", () => {
  const flags = { channelRules: IK_RULES({ quote_only: true }) };
  for (const viewer of [GUEST, SIGNED_IN]) {
    assert.equal(onlineOrderingOff(flags, viewer), true);
    assert.equal(refuseOnlinePurchase(flags, 499, null, viewer), CART_RESTRICTED_ERROR);
  }
});

test("Zoey out-of-stock refuses Add to Basket for everyone — no stock wording in the refusal", () => {
  const flags = { channelRules: IK_RULES({ out_of_stock: true }) };
  for (const viewer of [GUEST, SIGNED_IN]) {
    const refusal = refuseOnlinePurchase(flags, 499, null, viewer);
    assert.equal(refusal, CART_RESTRICTED_ERROR);
    assert.doesNotMatch(String(refusal), /stock/i);
  }
});

test("guest quote-only refuses a GUEST and admits a signed-in customer", () => {
  const flags = { channelRules: IK_RULES({ guest_quote_only: true }) };
  assert.equal(refuseOnlinePurchase(flags, 274.9, null, GUEST), CART_RESTRICTED_ERROR);
  assert.equal(refuseOnlinePurchase(flags, 274.9, null, SIGNED_IN), null);
  // A caller that cannot name the shopper is treated as a guest: it can only refuse, never admit.
  assert.equal(onlineOrderingOff(flags), true);
  // The cart line for a signed-in shopper is not marked restricted.
  assert.equal(onlineOrderingOff(flags, SIGNED_IN), false);
});

test("search-only is a listing rule — it never refuses the cart", () => {
  assert.equal(refuseOnlinePurchase({ channelRules: IK_RULES({ search_only: true }) }, 10, null, GUEST), null);
});

test("Chefs Depot: the IK rules do not exist for channel 2, so nothing is refused", () => {
  const all: Record<string, boolean>[] = [{ quote_only: true }, { guest_quote_only: true }, { out_of_stock: true }, { search_only: true }];
  for (const rules of all) {
    const flags = { channelRules: CD_RULES(rules) };
    assert.equal(flags.channelRules, null);
    assert.equal(onlineOrderingOff(flags, GUEST), false);
    assert.equal(refuseOnlinePurchase(flags, 10, null, GUEST), null);
  }
});

test("no rules on the product (today, before the backfill) changes nothing", () => {
  assert.equal(refuseOnlinePurchase({ channelRules: null }, 10, null, GUEST), null);
  assert.equal(refuseOnlinePurchase({ channelRules: IK_RULES({}) }, 10, null, GUEST), null);
  assert.equal(onlineOrderingOff({}, GUEST), false);
});

test("the facts read carries THIS channel's EFFECTIVE Zoey rules (staff overrides included), keyed by CHANNEL_ID", () => {
  const src = readFileSync(join(LIB, "cart/backorder-facts.ts"), "utf8");
  assert.match(src, /const channelId = deps\.channelId \?\? CHANNEL_ID;/);
  assert.match(src, /metafields -> 'zoey_channel_rules' AS zoey_channel_rules/);
  assert.match(src, /metafields -> 'channel_rule_overrides' AS channel_rule_overrides/);
  assert.match(src, /channelRules: readChannelRules\(\s*\{ zoey_channel_rules: row\.zoey_channel_rules, channel_rule_overrides: row\.channel_rule_overrides \},\s*channelId\s*\)/);
});

test("addToCart / updateCartItem / the cart view judge the rules for the shopper asking", () => {
  const src = readFileSync(join(LIB, "actions/cart.ts"), "utf8");
  assert.match(src, /onlineOrderingOff\(facts, viewer\)/);
  assert.match(src, /restrict_add_to_cart: onlineOrderingOff\(facts, lineViewer\)/);
  assert.match(src, /facts\?\.channelRules\?\.guestQuoteOnly \? await cartViewer\(\) : undefined/);
});
