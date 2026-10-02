import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { specialMarkerOf, withSpecialMarker, specialLineIsStale, isRewardLine } from "./special-line";

// Card tJ4audbu — a cart line re-judges its Partner Special: the special "ends by itself on the
// date set" in the cart too, and a line added before it started takes it once it runs.

const live = { promotionId: 168, priceExTax: 1300 };

test("the marker round-trips and keeps every entry that is not ours", () => {
  const reward = { promotion_reward: 7 };
  const marked = withSpecialMarker([reward], live);
  assert.deepEqual(marked, [reward, { partner_special: 168, price_ex_tax: 1300 }]);
  assert.deepEqual(specialMarkerOf(marked), { partner_special: 168, price_ex_tax: 1300 });
  // Re-pricing without a special removes ours and nothing else.
  assert.deepEqual(withSpecialMarker(marked, null), [reward]);
  // A fresh line (the column's default is []) and an unreadable column both start clean.
  assert.deepEqual(withSpecialMarker(null, live), [{ partner_special: 168, price_ex_tax: 1300 }]);
  assert.equal(specialMarkerOf({ partner_special: 1 }), null);
});

test("an ordinary line with no special is left frozen at its add-time price", () => {
  assert.equal(specialLineIsStale([], null), false);
  assert.equal(specialLineIsStale(null, undefined), false);
});

test("a line added BEFORE the special started takes it once it runs", () => {
  assert.equal(specialLineIsStale([], live), true);
});

test("a line priced by a special that has ENDED goes back to the normal price", () => {
  // Product 816 added on the last day at $1,300, paid three days later: re-priced, not $1,300.
  assert.equal(specialLineIsStale(withSpecialMarker([], live), null), true);
});

test("a line on the running special at its price is left alone; an edited price re-prices it", () => {
  const marked = withSpecialMarker([], live);
  assert.equal(specialLineIsStale(marked, live), false);
  assert.equal(specialLineIsStale(marked, { promotionId: 168, priceExTax: 1250 }), true);
  assert.equal(specialLineIsStale(marked, { promotionId: 170, priceExTax: 1300 }), true);
});

test("a promotion's reward line is never re-priced here (it moves with its own offer)", () => {
  assert.equal(isRewardLine([{ promotion_reward: 7 }]), true);
  assert.equal(specialLineIsStale([{ promotion_reward: 7 }], live), false);
  assert.equal(isRewardLine([{ partner_special: 168, price_ex_tax: 1300 }]), false);
});

// ── ONE lock, every charge path (card tJ4audbu, after the merge with #323's cart-side lock) ──────
const here = fileURLToPath(new URL(".", import.meta.url));
const source = (rel: string) => readFileSync(path.resolve(here, rel), "utf8");

test("the cart prices a special line once, and never lays the member scale's band over it", () => {
  const cart = source("../actions/cart.ts");
  const fn = cart.slice(cart.indexOf("async function resolveItemPricingAndSpecial"), cart.indexOf("function lockToPartnerSpecial"));
  assert.ok(fn.length > 0, "resolveItemPricingAndSpecial exists");
  const lockAt = fn.indexOf("lockToPartnerSpecial(layered");
  const bandAt = fn.indexOf("boundToMemberScale(");
  assert.ok(lockAt > 0 && bandAt > lockAt, "the special returns before the band is consulted");
  // No second cart-side lock path survives the merge.
  assert.equal((cart.match(/getLiveSpecials\(\[productId\]\)/g) ?? []).length, 1);
});

test("checkout's customer-group re-price leaves a Partner Special line alone", () => {
  const src = source("../checkout/group-prices.ts");
  const skip = src.indexOf("if (onSpecial.has(line.product_id)) continue;");
  const derive = src.indexOf("await groupLinePricing(");
  assert.ok(skip > 0 && derive > skip, "special lines are skipped before the group price is derived");
});
