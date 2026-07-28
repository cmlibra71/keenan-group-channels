import { test } from "node:test";
import assert from "node:assert/strict";
import { derivePriceDisplay } from "./price-display.ts";

const RRP = 1683;
const MEMBER = 1346.4; // 20% under RRP

test("public visitor sees RRP as the headline, labelled", () => {
  const d = derivePriceDisplay({ rrp: RRP, memberPrice: null, memberSavingsPct: 20 });
  assert.equal(d.headline, RRP);
  assert.equal(d.audience, "public");
  assert.equal(d.showRrpLabel, true);
  assert.equal(d.showStruckRrp, false, "nothing to strike through — RRP is the price");
  assert.equal(d.showMemberBadge, false);
});

test("public visitor gets NO money figure derived from the member price", () => {
  const d = derivePriceDisplay({ rrp: RRP, memberPrice: null, memberSavingsPct: 20 });
  assert.equal(d.savings, 0);
  assert.equal(d.savingsPct, 0);
});

test("the join funnel survives for a public visitor with no member price", () => {
  // The regression this whole file exists for: showJoin must NOT depend on a
  // member price being present, or gating the pricing deletes the funnel.
  const d = derivePriceDisplay({ rrp: RRP, memberPrice: null, memberSavingsPct: 20 });
  assert.equal(d.showJoin, true);
  assert.equal(d.teaserPct, 20);
});

test("teaser copy stays generic when there is no percentage to advertise", () => {
  const d = derivePriceDisplay({ rrp: RRP, memberPrice: null, memberSavingsPct: 0 });
  assert.equal(d.showJoin, true);
  assert.equal(d.teaserPct, 0);
});

test("member sees their price, the struck RRP and the real saving", () => {
  const d = derivePriceDisplay({ rrp: RRP, memberPrice: MEMBER, isMember: true });
  assert.equal(d.audience, "member");
  assert.equal(d.headline, MEMBER);
  assert.equal(d.showStruckRrp, true);
  assert.equal(d.savings, RRP - MEMBER);
  assert.equal(d.savingsPct, 20);
  assert.equal(d.showMemberBadge, true);
  assert.equal(d.showJoin, false, "a member must not be sold a membership");
});

test("member on a product with no member deal just sees the price", () => {
  const d = derivePriceDisplay({ rrp: RRP, memberPrice: null, isMember: true, memberSavingsPct: 20 });
  assert.equal(d.headline, RRP);
  assert.equal(d.audience, "member");
  assert.equal(d.showJoin, false);
  assert.equal(d.teaserPct, 0);
  assert.equal(d.showRrpLabel, false, "no need to explain the price to a member");
});

test("B2B contract price is not dressed up as a membership perk", () => {
  const d = derivePriceDisplay({
    rrp: RRP,
    memberPrice: 1500,
    isMember: false,
    accountPricing: true,
  });
  assert.equal(d.audience, "account");
  assert.equal(d.headline, 1500);
  assert.equal(d.showStruckRrp, true);
  assert.equal(d.showAccountLabel, true);
  assert.equal(d.showMemberBadge, false);
  assert.equal(d.savings, 0, "no member-flavoured savings line on a contract price");
  assert.equal(d.showJoin, false, "do not pitch membership at someone with a contract");
});

test("member who ALSO has an account keeps member framing", () => {
  const d = derivePriceDisplay({
    rrp: RRP,
    memberPrice: 1500,
    isMember: true,
    accountPricing: true,
  });
  assert.equal(d.audience, "member");
  assert.equal(d.showMemberBadge, true);
});

test("POA (no price) renders nothing at all", () => {
  for (const rrp of [0, -1, NaN]) {
    const d = derivePriceDisplay({ rrp, memberPrice: null, memberSavingsPct: 20 });
    assert.equal(d.hidden, true, `rrp=${rrp} should be hidden`);
    assert.equal(d.showJoin, false, "no join box on a product with no price");
  }
});

test("a member price that does not beat RRP is not a deal", () => {
  for (const mp of [RRP, RRP + 1, 0, -5]) {
    const d = derivePriceDisplay({ rrp: RRP, memberPrice: mp, isMember: true });
    assert.equal(d.headline, RRP, `memberPrice=${mp} should not become the headline`);
    assert.equal(d.showStruckRrp, false);
  }
});

test("no public state ever exposes a member-derived money figure", () => {
  const states: Parameters<typeof derivePriceDisplay>[0][] = [
    { rrp: RRP, memberPrice: null, memberSavingsPct: 20 },
    { rrp: RRP, memberPrice: null, isMember: false, memberSavingsPct: 48 },
    { rrp: RRP, memberPrice: null, isMember: false, accountPricing: false },
  ];
  for (const s of states) {
    const d = derivePriceDisplay(s);
    assert.equal(d.savings, 0, `leaked savings for ${JSON.stringify(s)}`);
    assert.equal(d.savingsPct, 0, `leaked pct for ${JSON.stringify(s)}`);
    assert.equal(d.headline, RRP, `headline was not RRP for ${JSON.stringify(s)}`);
  }
});
