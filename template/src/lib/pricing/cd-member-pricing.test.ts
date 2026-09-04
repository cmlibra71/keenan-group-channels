import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decidePriceRows,
  isChargedAmount,
  pricesForVariant,
  type CdMembershipLadder,
  type CdVariantPrices,
} from "./cd-member-pricing";

// ============================================================================
// The row-selection rules on the Chefs Depot member-pricing panel (card Nyp8bkPm).
//
// These are the decisions an independent review rejected this panel for getting
// wrong the first time — a payment claim attached to a row the page was not
// charging — so they are pinned here rather than only in a screenshot. The
// component does no deciding of its own; it renders what `decidePriceRows`
// returns.
// ============================================================================

const LADDER: CdMembershipLadder = {
  ladderEnabled: true,
  isMember: false,
  loggedIn: false,
  membershipMonthly: 14.95,
  joinHref: "/membership",
  advertisesMates: false,
  levelId: "L1",
  levelLabel: "Level 1",
  levelIndex: 0,
  ladder: [
    { id: "L1", label: "Level 1", threshold: 1, reached: true },
    { id: "L7", label: "Level 7", threshold: 10000, reached: false },
  ],
  trailingSpend: null,
  spendToNext: null,
  nextLevelLabel: "Level 7",
  pricesByVariant: {},
  defaultVariantId: 11,
  entryLevelLabel: "Level 1",
  deepestLevelLabel: "Level 7",
  atDeepestLevel: false,
};

const PRICES: CdVariantPrices = { mates: 850, entry: 787.8, deepest: 646.4, member: 787.8 };

const ladder = (over: Partial<CdMembershipLadder> = {}): CdMembershipLadder => ({
  ...LADDER,
  ...over,
});

test("a guest paying RRP: the payment claim lands on the RRP row and nowhere else", () => {
  const d = decidePriceRows({
    data: ladder(),
    prices: PRICES,
    rrpExGst: 999,
    chargedExGst: 999,
  });
  assert.equal(d.showRrp, true);
  assert.equal(d.rrpIsCharged, true);
  assert.equal(d.showMates, false, "M is not advertised under advertisedPrice: catalogue");
  assert.equal(d.showMember, true, "the entry rung is what joining buys today");
  assert.equal(d.memberAmount, 787.8);
  assert.equal(d.showDeepest, true, "the card's third figure");
  assert.equal(d.deepestIsCharged, false);
});

test("THE REJECTION: a page charging a sale price puts a payment claim on NO row", () => {
  // The live defect: "Mates Rates $10,759 — what you pay today" beside a headline
  // and a cart both charging $14,393.
  const d = decidePriceRows({
    data: ladder({ advertisesMates: true }),
    prices: PRICES,
    rrpExGst: 14393,
    chargedExGst: 10759,
  });
  assert.equal(d.showMates, true);
  assert.equal(d.matesIsCharged, false, "M is not what this page is charging");
  assert.equal(d.rrpIsCharged, false);
  assert.equal(d.deepestIsCharged, false);
});

test("advertisedPrice: mates drops the RRP row, catalogue drops the Mates row", () => {
  const mates = decidePriceRows({
    data: ladder({ advertisesMates: true }),
    prices: PRICES,
    rrpExGst: 999,
    chargedExGst: 850,
  });
  assert.equal(mates.showMates, true);
  assert.equal(mates.showRrp, false, "the headline chip still says RRP; two would contradict");

  const catalogue = decidePriceRows({
    data: ladder(),
    prices: PRICES,
    rrpExGst: 999,
    chargedExGst: 999,
  });
  assert.equal(catalogue.showMates, false);
  assert.equal(catalogue.showRrp, true);
});

test("a member's row IS the charged price, labelled with their rung", () => {
  const d = decidePriceRows({
    data: ladder({ isMember: true, levelId: "L4", levelLabel: "Level 4" }),
    prices: { ...PRICES, member: 717.1 },
    rrpExGst: 999,
    chargedExGst: 717.1,
  });
  assert.equal(d.showMember, true);
  assert.equal(d.memberAmount, 717.1);
});

test("a member charged UNDER the ladder figure still shows the charged price", () => {
  // A clearance or contract price beat the ladder; the engine takes the better of
  // the two and never stacks them.
  const d = decidePriceRows({
    data: ladder({ isMember: true }),
    prices: { ...PRICES, member: 787.8 },
    rrpExGst: 999,
    chargedExGst: 700,
  });
  assert.equal(d.memberAmount, 700, "one machine, one member price");
});

test("a member charged ABOVE the ladder figure gets NO member row", () => {
  // The ladder is not in force for this shopper; printing a member price they are
  // not being given is the two-prices-on-one-screen failure.
  const d = decidePriceRows({
    data: ladder({ isMember: true }),
    prices: { ...PRICES, member: 787.8 },
    rrpExGst: 999,
    chargedExGst: 900,
  });
  assert.equal(d.showMember, false);
  assert.equal(d.memberAmount, null);
});

test("the deepest row is suppressed when it would duplicate a row already on screen", () => {
  const atTop = decidePriceRows({
    data: ladder({ isMember: true, atDeepestLevel: true }),
    prices: { ...PRICES, member: 646.4 },
    rrpExGst: 999,
    chargedExGst: 646.4,
  });
  assert.equal(atTop.showMember, true);
  assert.equal(atTop.showDeepest, false, "one machine must not carry two figures under two labels");

  const equalByValue = decidePriceRows({
    data: ladder({ isMember: true }),
    prices: { ...PRICES, member: 646.4 },
    rrpExGst: 999,
    chargedExGst: 646.4,
  });
  assert.equal(equalByValue.showDeepest, false);
});

test("a HELD SKU — no ladder figure at any rung — publishes nothing", () => {
  const d = decidePriceRows({
    data: ladder(),
    prices: { mates: null, entry: null, deepest: null, member: null },
    rrpExGst: null,
    chargedExGst: null,
  });
  assert.equal(d.anyRow, false, "the panel falls back to the pitch alone");
});

test("no trade row for the variant on screen: nothing, never a partial claim", () => {
  const d = decidePriceRows({ data: ladder(), prices: null, rrpExGst: 999, chargedExGst: 999 });
  assert.equal(d.anyRow, false);
  assert.equal(d.memberAmount, null);
});

test("an RRP row needs a positive headline amount, not a zero or a null", () => {
  for (const rrp of [null, 0, -1]) {
    const d = decidePriceRows({ data: ladder(), prices: PRICES, rrpExGst: rrp, chargedExGst: 999 });
    assert.equal(d.showRrp, false, `rrpExGst ${rrp}`);
  }
});

test("pricesForVariant follows the selection, then the variant the page opened on", () => {
  const data = ladder({
    pricesByVariant: { 11: PRICES, 12: { ...PRICES, member: 700 } },
    defaultVariantId: 11,
  });
  assert.equal(pricesForVariant(data, 12)?.member, 700);
  assert.equal(pricesForVariant(data, null)?.member, 787.8, "falls back to the default");
  assert.equal(pricesForVariant(data, 99), null, "an unpriced variant is absent, not guessed");
  assert.equal(
    pricesForVariant(ladder({ pricesByVariant: { 11: PRICES }, defaultVariantId: null }), null),
    null,
    "multi-variant with nothing picked publishes no prices"
  );
});

test("isChargedAmount matches to the cent and no further", () => {
  assert.equal(isChargedAmount(717.1, 717.1), true);
  assert.equal(isChargedAmount(717.1, 717.104), true, "sub-cent float noise still matches");
  assert.equal(isChargedAmount(717.1, 717.12), false);
  assert.equal(isChargedAmount(null, 717.1), false);
  assert.equal(isChargedAmount(717.1, null), false);
});
