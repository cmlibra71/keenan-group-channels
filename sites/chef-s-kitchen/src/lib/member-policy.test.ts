import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMemberPricing, type MemberPricingFacts } from "./member-policy.ts";

const BASE_GROUP = 1505;
const TIER_GROUP = 1506;

function facts(over: Partial<MemberPricingFacts> = {}): MemberPricingFacts {
  return {
    featureEnabled: true,
    hasSession: false,
    hasActiveSubscription: false,
    contactGroupId: null,
    basePlanGroupId: BASE_GROUP,
    basePlanPrice: "14.95",
    accountId: null,
    ...over,
  };
}

test("guest carries NO pricing group", () => {
  const d = resolveMemberPricing(facts());
  assert.equal(d.customerGroupId, null, "a guest must not be priced at a member group");
  assert.equal(d.isMember, false);
  assert.equal(d.loggedIn, false);
});

test("guest keeps the teaser group and plan price so the join funnel survives", () => {
  const d = resolveMemberPricing(facts());
  assert.equal(d.teaserCustomerGroupId, BASE_GROUP);
  assert.equal(d.planPrice, "14.95");
});

test("signed in WITHOUT a subscription is priced exactly like a guest", () => {
  const guest = resolveMemberPricing(facts());
  const lapsed = resolveMemberPricing(facts({ hasSession: true }));
  assert.equal(lapsed.customerGroupId, null);
  assert.equal(lapsed.isMember, false);
  assert.equal(lapsed.customerGroupId, guest.customerGroupId);
  assert.equal(lapsed.teaserCustomerGroupId, guest.teaserCustomerGroupId);
  // ...but they ARE signed in, which guests are not.
  assert.equal(lapsed.loggedIn, true);
});

test("active subscriber gets their own tier group", () => {
  const d = resolveMemberPricing(
    facts({ hasSession: true, hasActiveSubscription: true, contactGroupId: TIER_GROUP })
  );
  assert.equal(d.customerGroupId, TIER_GROUP);
  assert.equal(d.isMember, true);
  assert.equal(d.loggedIn, true);
  assert.equal(d.teaserCustomerGroupId, null, "members have nothing to be teased about");
});

test("active subscriber with no group of their own falls back to the plan's base group", () => {
  const d = resolveMemberPricing(facts({ hasSession: true, hasActiveSubscription: true }));
  assert.equal(d.customerGroupId, BASE_GROUP);
  assert.equal(d.isMember, true);
});

test("B2B account survives with no subscription — a contract price is not a perk", () => {
  const d = resolveMemberPricing(facts({ hasSession: true, accountId: 42 }));
  assert.equal(d.accountId, 42);
  assert.equal(d.customerGroupId, null, "account pricing must not smuggle in a member group");
  assert.equal(d.isMember, false);
});

test("B2B account survives even when member pricing is switched off", () => {
  const d = resolveMemberPricing(facts({ featureEnabled: false, hasSession: true, accountId: 42 }));
  assert.equal(d.accountId, 42);
  assert.equal(d.customerGroupId, null);
  assert.equal(d.teaserCustomerGroupId, null, "no teaser when the feature is off");
  assert.equal(d.planPrice, null);
});

test("feature off: even an active subscriber gets no group", () => {
  const d = resolveMemberPricing(
    facts({ featureEnabled: false, hasSession: true, hasActiveSubscription: true, contactGroupId: TIER_GROUP })
  );
  assert.equal(d.customerGroupId, null);
  assert.equal(d.isMember, false);
});

test("no plans configured: guest gets no teaser group, and no crash", () => {
  const d = resolveMemberPricing(facts({ basePlanGroupId: null, basePlanPrice: null }));
  assert.equal(d.teaserCustomerGroupId, null);
  assert.equal(d.planPrice, null);
  assert.equal(d.customerGroupId, null);
});

test("NO non-member state ever carries a pricing group", () => {
  const nonMemberStates: Partial<MemberPricingFacts>[] = [
    {},
    { hasSession: true },
    { hasSession: true, accountId: 7 },
    { featureEnabled: false },
    { featureEnabled: false, hasSession: true, hasActiveSubscription: true },
    { hasSession: false, contactGroupId: TIER_GROUP },
    { hasSession: true, contactGroupId: TIER_GROUP },
  ];
  for (const over of nonMemberStates) {
    const d = resolveMemberPricing(facts(over));
    if (d.isMember) continue;
    assert.equal(
      d.customerGroupId,
      null,
      `non-member state ${JSON.stringify(over)} leaked group ${d.customerGroupId}`
    );
  }
});
