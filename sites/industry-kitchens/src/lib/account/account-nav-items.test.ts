import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAccountNavItems,
  isAccountNavItemCurrent,
  type AccountNavFlags,
} from "./account-nav-items.ts";

const ALL_OFF: AccountNavFlags = {
  subscriptionsEnabled: false,
  drawsEnabled: false,
  partnerOffersEnabled: false,
};
const ALL_ON: AccountNavFlags = {
  subscriptionsEnabled: true,
  drawsEnabled: true,
  partnerOffersEnabled: true,
};

test("with every flag on the menu is the full eleven items, in order", () => {
  assert.deepEqual(
    buildAccountNavItems(ALL_ON).map((i) => i.label),
    [
      "Account Dashboard",
      "Account Details",
      "Password & Security",
      "Order History",
      "My Quotes",
      "Contact your rep",
      "Membership",
      "My Draws",
      "Partner Offers",
      "Continue Shopping",
      "Sign Out",
    ]
  );
});

test("with every flag off the three optional items are ABSENT, not greyed", () => {
  const items = buildAccountNavItems(ALL_OFF);
  assert.deepEqual(
    items.map((i) => i.label),
    [
      "Account Dashboard",
      "Account Details",
      "Password & Security",
      "Order History",
      "My Quotes",
      "Contact your rep",
      "Continue Shopping",
      "Sign Out",
    ]
  );
});

test("the flags are independent of one another", () => {
  const labels = (flags: AccountNavFlags) => buildAccountNavItems(flags).map((i) => i.label);
  assert.ok(labels({ ...ALL_OFF, drawsEnabled: true }).includes("My Draws"));
  assert.ok(!labels({ ...ALL_OFF, drawsEnabled: true }).includes("Membership"));
  assert.ok(!labels({ ...ALL_OFF, drawsEnabled: true }).includes("Partner Offers"));

  assert.ok(labels({ ...ALL_OFF, subscriptionsEnabled: true }).includes("Membership"));
  assert.ok(!labels({ ...ALL_OFF, subscriptionsEnabled: true }).includes("My Draws"));

  assert.ok(labels({ ...ALL_OFF, partnerOffersEnabled: true }).includes("Partner Offers"));
  assert.ok(!labels({ ...ALL_OFF, partnerOffersEnabled: true }).includes("My Draws"));
});

test("the optional items keep their position, just below Contact your rep", () => {
  const labels = buildAccountNavItems({ ...ALL_OFF, partnerOffersEnabled: true }).map(
    (i) => i.label
  );
  assert.equal(labels.indexOf("Contact your rep"), labels.indexOf("My Quotes") + 1);
  assert.equal(labels.indexOf("Partner Offers"), labels.indexOf("Contact your rep") + 1);
  assert.equal(labels.indexOf("Continue Shopping"), labels.indexOf("Partner Offers") + 1);
});

test("Sign Out is an action with no href; every other item links somewhere", () => {
  const items = buildAccountNavItems(ALL_ON);
  const signOut = items.find((i) => i.key === "signout");
  assert.ok(signOut);
  assert.equal(signOut.href, undefined);
  for (const item of items.filter((i) => i.key !== "signout")) {
    assert.ok(item.href && item.href.startsWith("/"), `${item.key} has no usable href`);
  }
});

test("'Contact your rep' is in the menu, and goes somewhere real", () => {
  // It used to be deliberately absent: the storefront held no rep data. It does
  // now (card DIj4B7Gr) — the rep on the customer's most recent quote, or the
  // storefront's customer service desk.
  const items = buildAccountNavItems(ALL_ON);
  const contact = items.find((i) => i.key === "contact");
  assert.ok(contact, "Contact your rep is missing from the menu");
  assert.equal(contact.label, "Contact your rep");
  assert.equal(contact.href, "/account/contact");
});

test("keys are unique so a component can map them to icons safely", () => {
  const keys = buildAccountNavItems(ALL_ON).map((i) => i.key);
  assert.equal(new Set(keys).size, keys.length);
});

// ── current-item marking ─────────────────────────────────────────────────────

const items = buildAccountNavItems(ALL_ON);
const item = (key: string) => items.find((i) => i.key === key)!;

test("the dashboard is current only on /account itself", () => {
  assert.equal(isAccountNavItemCurrent(item("dashboard"), "/account"), true);
  assert.equal(isAccountNavItemCurrent(item("dashboard"), "/account/quotes"), false);
  assert.equal(isAccountNavItemCurrent(item("dashboard"), "/account/orders/12"), false);
});

test("a section stays current on its detail pages", () => {
  assert.equal(isAccountNavItemCurrent(item("quotes"), "/account/quotes"), true);
  assert.equal(isAccountNavItemCurrent(item("quotes"), "/account/quotes/123"), true);
  assert.equal(isAccountNavItemCurrent(item("orders"), "/account/orders/456"), true);
  assert.equal(isAccountNavItemCurrent(item("orders"), "/account/quotes/456"), false);
});

test("Continue Shopping is current only on /products exactly", () => {
  assert.equal(isAccountNavItemCurrent(item("shop"), "/products"), true);
  assert.equal(isAccountNavItemCurrent(item("shop"), "/products/some-blender"), false);
});

test("a trailing slash does not defeat the match", () => {
  assert.equal(isAccountNavItemCurrent(item("dashboard"), "/account/"), true);
  assert.equal(isAccountNavItemCurrent(item("quotes"), "/account/quotes/"), true);
});

test("Sign Out is never marked current", () => {
  assert.equal(isAccountNavItemCurrent(item("signout"), "/account"), false);
});

test("a sibling route with a shared prefix is not marked current", () => {
  // /account/profile must not light up for a hypothetical /account/profiles
  assert.equal(isAccountNavItemCurrent(item("profile"), "/account/profiles"), false);
});
