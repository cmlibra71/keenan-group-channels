import { test } from "node:test";
import assert from "node:assert/strict";
import {
  describeAccountRole,
  isRetiredAccountRole,
  isManagerRole,
  roleCanPayByCard,
  selectableAccountRoles,
} from "./account-roles.ts";

// Permission sets below are trimmed copies of the LIVE rows in `account_roles`
// (production, 2026-08-14) so the wording is tested against real data shapes.

const MANAGER = {
  id: 6,
  name: "Manager",
  scope: "main",
  permissions: [
    "add_contact",
    "edit_contact",
    "remove_contact",
    "view_company_orders",
    "receive_email_for_company_orders",
    "receive_email_for_company_order_invoices",
    "save_company_card_from_checkout",
    "use_company_card_in_checkout",
    "submit_orders",
    { deny: ["convert_quotes_to_order_require_approval"], conditions: {} },
  ],
};

const BILLING = {
  id: 3,
  name: "Billing",
  scope: "main",
  permissions: [
    "receive_email_for_company_order_invoices",
    "use_company_card_in_checkout",
    "submit_orders",
    { deny: ["add_contact", "edit_contact", "view_company_orders"], conditions: {} },
  ],
};

const SHIPPING = {
  id: 8,
  name: "Shipping",
  scope: "main",
  permissions: [
    "receive_email_for_company_order_shipments",
    "use_company_card_in_checkout",
    "submit_orders",
    { deny: ["add_contact", "edit_contact", "view_company_orders"], conditions: {} },
  ],
};

// Live shape: an ADDITIONAL role's stored permissions carry no add_contact /
// edit_contact key at all (Zoey's additional-role form has 34 checkboxes, not
// 45), and an absent code defaults to allow in the enforcement resolver.
const BUYER_REQUIRES_APPROVAL = {
  id: 5,
  name: "Buyer Requires Approval",
  scope: "additional",
  permissions: [
    "submit_orders",
    "convert_quotes_to_order_require_approval",
    { deny: ["view_company_orders"], conditions: {} },
  ],
};

test("retired roles are the bracketed ones, and only those", () => {
  assert.equal(isRetiredAccountRole("(Deprecated) Account Admin"), true);
  assert.equal(isRetiredAccountRole("(Legacy Account Role)"), true);
  assert.equal(isRetiredAccountRole("Manager"), false);
  assert.equal(isRetiredAccountRole(null), false);
});

test("selectable roles hide the retired ones and sort by name", () => {
  const roles = selectableAccountRoles([
    { id: 1, name: "(Deprecated) Account Admin", permissions: [] },
    MANAGER,
    BILLING,
  ]);
  assert.deepEqual(
    roles.map((r) => r.name),
    ["Billing", "Manager"]
  );
});

test("Manager and Billing are the card-payment roles (Tim, Sh03niVC)", () => {
  assert.equal(roleCanPayByCard("Manager"), true);
  assert.equal(roleCanPayByCard("billing"), true);
  assert.equal(roleCanPayByCard("Buyer"), false);
  assert.equal(roleCanPayByCard(null), false);
});

test("Shipping holds Zoey's checkout-card codes but is NOT flagged as able to pay by card", () => {
  const shipping = describeAccountRole(SHIPPING);
  assert.equal(shipping.canPayByCard, false);
  assert.ok(shipping.details.includes("Cannot pay by credit card"));
});

test("Manager reads as full access, in plain words", () => {
  const manager = describeAccountRole(MANAGER);
  assert.equal(manager.canPayByCard, true);
  assert.equal(manager.canOrderForBusiness, true);
  assert.equal(manager.ordersNeedApproval, false);
  assert.equal(manager.seesAllOrders, true);
  assert.equal(manager.managesPeople, true);
  assert.ok(manager.details.includes("Can place orders on behalf of the business"));
  assert.ok(manager.details.includes("Can pay by credit card"));
  assert.ok(manager.details.includes("Can see every order on the account"));
  assert.ok(
    manager.details.some((d) => d.startsWith("Gets the account's")),
    "manager should be told which account emails the role receives"
  );
});

test("Billing can pay by card but cannot manage people or see every order", () => {
  const billing = describeAccountRole(BILLING);
  assert.equal(billing.canPayByCard, true);
  assert.equal(billing.managesPeople, false);
  assert.equal(billing.seesAllOrders, false);
  assert.ok(billing.details.includes("Can only see their own orders"));
});

test("a role whose orders need approval says so instead of claiming free rein", () => {
  const role = describeAccountRole(BUYER_REQUIRES_APPROVAL);
  assert.equal(role.canOrderForBusiness, true);
  assert.equal(role.ordersNeedApproval, true);
  assert.ok(
    role.details.includes(
      "Can place orders for the business, but a manager has to approve them first"
    )
  );
  assert.equal(role.canPayByCard, false);
});

test("an additional role is never described as able to manage people", () => {
  // The permission is ABSENT, not denied, and absent defaults to allow — which
  // would have told a Buyer they can add and remove people and saved cards.
  const role = describeAccountRole(BUYER_REQUIRES_APPROVAL);
  assert.equal(role.managesPeople, false);
  assert.equal(
    role.details.some((d) => d.includes("add and remove people")),
    false
  );
});

test("manager role is matched by name, case-insensitively", () => {
  assert.equal(isManagerRole("Manager"), true);
  assert.equal(isManagerRole(" manager "), true);
  assert.equal(isManagerRole("Billing"), false);
  assert.equal(isManagerRole(null), false);
});
