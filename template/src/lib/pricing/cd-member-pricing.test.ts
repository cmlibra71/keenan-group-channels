import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CD_PRICING,
  decidePanel,
  isChargedAmount,
  positionPercent,
  pricesForVariant,
  type CdMembershipLadder,
  type CdVariantPrices,
} from "./cd-member-pricing";

// ============================================================================
// The show/suppress rules on the Chefs Depot member-pricing panel (cards
// Nyp8bkPm + gk23c1VK — Tim's locked 11 Sep 2026 model and his product-page
// widgets). The component does no deciding of its own; it renders what
// `decidePanel` returns, so the rules are pinned here rather than in a
// screenshot.
// ============================================================================

/** SKOPE TCE1000N (master document §7.3): M $3,051.18, W $2,945.05 → floor $2,974.50. */
const TCE: CdVariantPrices = { mates: 3051.18, floor: 2974.5, member: null, hasBand: true };

const BASE: CdMembershipLadder = {
  ladderEnabled: true,
  isMember: false,
  loggedIn: false,
  membershipMonthly: 14.95,
  joinHref: "/membership",
  topSpend: 50_000,
  share: null,
  trailingSpend: null,
  productExcluded: false,
  pricesByVariant: { 11: TCE },
  defaultVariantId: 11,
};

const data = (over: Partial<CdMembershipLadder> = {}): CdMembershipLadder => ({ ...BASE, ...over });

test("a guest gets the TEASER: the deepest member price on this product and the scale from M down to it", () => {
  const d = decidePanel({ data: data(), prices: TCE, chargedExGst: 3051.18 });
  assert.deepEqual(d, { kind: "teaser", mates: 3051.18, floor: 2974.5 });
});

test("the teaser never carries anyone's member price", () => {
  // Even if a figure somehow reached a non-member's payload, it is not rendered.
  const d = decidePanel({ data: data(), prices: { ...TCE, member: 3000 }, chargedExGst: 3051.18 });
  assert.equal(d.kind, "teaser");
  assert.equal("price" in d, false);
});

test("a member at $0 spend is shown the standard price as THEIR price — no step on joining", () => {
  const d = decidePanel({
    data: data({ isMember: true, share: 0, trailingSpend: 0 }),
    prices: { ...TCE, member: 3051.18 },
    chargedExGst: 3051.18,
  });
  assert.equal(d.kind, "member");
  if (d.kind !== "member") return;
  assert.equal(d.price, 3051.18);
  assert.equal(d.share, 0);
  assert.equal(d.toGo, 50_000);
  assert.equal(d.atFloor, false);
});

test("a member in progress: their price, their position, the spend still to go", () => {
  const d = decidePanel({
    data: data({ isMember: true, share: 0.42, trailingSpend: 21_000 }),
    prices: { ...TCE, member: 3018.97 },
    chargedExGst: 3018.97,
  });
  assert.equal(d.kind, "member");
  if (d.kind !== "member") return;
  assert.equal(d.price, 3018.97);
  assert.equal(positionPercent(d.share), "42.0%");
  assert.equal(d.toGo, 29_000);
});

test("a member whose spend grew since the review is not told they have spent less than they have", () => {
  const d = decidePanel({
    data: data({ isMember: true, share: 0.2, trailingSpend: 30_000 }),
    prices: { ...TCE, member: 3035.84 },
    chargedExGst: 3035.84,
  });
  if (d.kind !== "member") return assert.fail("expected a member panel");
  assert.equal(d.spend, 30_000);
  assert.equal(d.toGo, 20_000);
});

test("a member at $50,000+ is at the floor — no rail, 'you've arrived'", () => {
  const d = decidePanel({
    data: data({ isMember: true, share: 1, trailingSpend: 64_000 }),
    prices: { ...TCE, member: 2974.5 },
    chargedExGst: 2974.5,
  });
  if (d.kind !== "member") return assert.fail("expected a member panel");
  assert.equal(d.atFloor, true);
  assert.equal(d.toGo, 0);
});

test("a member charged UNDER their scale price (a sharper promotion won) is shown what they are charged", () => {
  const d = decidePanel({
    data: data({ isMember: true, share: 0.5 }),
    prices: { ...TCE, member: 3012.84 },
    chargedExGst: 2990,
  });
  if (d.kind !== "member") return assert.fail("expected a member panel");
  assert.equal(d.price, 2990);
});

test("a member charged ABOVE their scale price gets nothing — the scale is not what prices them", () => {
  const d = decidePanel({
    data: data({ isMember: true, share: 0.5 }),
    prices: { ...TCE, member: 3012.84 },
    chargedExGst: 3051.18,
  });
  assert.deepEqual(d, { kind: "none" });
});

test("an EXCLUDED product discloses itself to members and non-members alike, with no price", () => {
  assert.deepEqual(decidePanel({ data: data({ productExcluded: true }), prices: TCE, chargedExGst: 3051.18 }), {
    kind: "excluded",
  });
  assert.deepEqual(
    decidePanel({ data: data({ productExcluded: true, isMember: true, share: 1 }), prices: TCE, chargedExGst: 3051.18 }),
    { kind: "excluded" }
  );
});

test("it fails closed: no band (held, or Wholesale + 1% not below M) means no figures", () => {
  assert.deepEqual(decidePanel({ data: data(), prices: { ...TCE, hasBand: false }, chargedExGst: 3051.18 }), {
    kind: "none",
  });
  assert.deepEqual(
    decidePanel({ data: data(), prices: { mates: 100, floor: 100.5, member: null, hasBand: true }, chargedExGst: 100 }),
    { kind: "none" }
  );
  assert.deepEqual(decidePanel({ data: data(), prices: null, chargedExGst: 100 }), { kind: "none" });
});

test("pricesForVariant follows the selection, then the variant the page opened on", () => {
  const d = data({ pricesByVariant: { 11: TCE, 12: { ...TCE, mates: 999 } } });
  assert.equal(pricesForVariant(d, 12)?.mates, 999);
  assert.equal(pricesForVariant(d, null)?.mates, 3051.18);
  assert.equal(pricesForVariant(data({ defaultVariantId: null }), null), null);
});

test("isChargedAmount matches to the cent and no further", () => {
  assert.equal(isChargedAmount(10.004, 10), true);
  assert.equal(isChargedAmount(10.01, 10), false);
  assert.equal(isChargedAmount(null, 10), false);
});

test("a position is floored, never overstated", () => {
  assert.equal(positionPercent(0.4299), "42.9%");
  assert.equal(positionPercent(1.5), "100.0%");
  assert.equal(positionPercent(-1), "0.0%");
});

test("no catalogue-wide saving claim can render: the spread is unmeasured", () => {
  assert.equal(CD_PRICING.spread, null);
});
