import { test } from "node:test";
import assert from "node:assert/strict";
import {
  describeAccountRole,
  isRetiredAccountRole,
  isManagerRole,
  roleCanPayByCard,
  roleManagesPeople,
  selectableAccountRoles,
} from "./account-roles.ts";

// The permission sets below are the LIVE rows out of `account_roles`
// (production, read 2026-08-14), trimmed to the codes these tests read but
// otherwise faithful — including which codes are GRANTED, which are DENIED and,
// crucially, which are simply ABSENT. The distinction is the whole subject of
// `roleManagesPeople`, and a fixture that invents a tidy shape tests nothing.

const MANAGER = {
  id: 6,
  name: "Manager",
  scope: "main",
  permissions: [
    "add_contact",
    "edit_contact",
    "remove_contact",
    "view_company_orders",
    "approve_quotes",
    "convert_company_quotes_to_order",
    "receive_email_for_company_orders",
    "receive_email_for_company_order_shipments",
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
    "save_company_card_from_checkout",
    "submit_orders",
    {
      deny: [
        "add_contact",
        "edit_contact",
        "view_company_orders",
        "approve_quotes",
        "convert_company_quotes_to_order",
        "receive_email_for_company_orders",
        "receive_email_for_company_order_shipments",
      ],
      conditions: {},
    },
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
    {
      deny: [
        "add_contact",
        "edit_contact",
        "view_company_orders",
        "approve_quotes",
        "receive_email_for_company_orders",
        "receive_email_for_company_order_invoices",
      ],
      conditions: {},
    },
  ],
};

// An ADDITIONAL role's stored permissions carry no add_contact / edit_contact
// key at all (Zoey's additional-role form has 34 checkboxes, not 45), and an
// absent action code defaults to ALLOW in the enforcement resolver.
const BUYER_REQUIRES_APPROVAL = {
  id: 5,
  name: "Buyer Requires Approval",
  scope: "additional",
  permissions: [
    "submit_orders",
    "use_company_card_in_checkout",
    "convert_quotes_to_order_require_approval",
    { deny: ["view_company_orders", "approve_quotes"], conditions: {} },
  ],
};

// 10 LIVE memberships. Scope is NULL and the row grants exactly one code — so
// add_contact/edit_contact are absent, and reading the permissive default as
// authority handed this role the run of the account's people list.
const LEGACY = {
  id: 2,
  name: "(Legacy Account Role)",
  scope: null,
  permissions: ["view_company_orders"],
};

// 1 LIVE membership. Scope says `additional`, but the row EXPLICITLY grants
// add_contact and edit_contact. An explicit tick beats the scope default.
const DEPRECATED_ADMIN = {
  id: 1,
  name: "(Deprecated) Account Admin",
  scope: "additional",
  permissions: ["add_contact", "edit_contact", "remove_contact", "view_company_orders", "submit_orders"],
};

test("retired roles are the bracketed ones, and only those", () => {
  assert.equal(isRetiredAccountRole("(Deprecated) Account Admin"), true);
  assert.equal(isRetiredAccountRole("(Legacy Account Role)"), true);
  assert.equal(isRetiredAccountRole("Manager"), false);
  assert.equal(isRetiredAccountRole(null), false);
});

test("selectable roles hide the retired ones and sort by name", () => {
  const roles = selectableAccountRoles([DEPRECATED_ADMIN, MANAGER, BILLING]);
  assert.deepEqual(
    roles.map((r) => r.name),
    ["Billing", "Manager"]
  );
});

// ── managesPeople: explicit grant/deny wins, scope only picks the default ────

test("an EXPLICIT grant beats the scope default (live: (Deprecated) Account Admin)", () => {
  // scope = additional, but add_contact and edit_contact are both ticked.
  assert.equal(roleManagesPeople(DEPRECATED_ADMIN), true);
  assert.equal(describeAccountRole(DEPRECATED_ADMIN).managesPeople, true);
});

test("an ABSENT code on a role that is not a main-contact role is a NO (live: (Legacy Account Role))", () => {
  // scope NULL, no add/edit key at all. Scope-alone said yes and let 10 live
  // memberships rewrite the shared account list.
  assert.equal(roleManagesPeople(LEGACY), false);
  assert.equal(describeAccountRole(LEGACY).managesPeople, false);
});

test("an EXPLICIT deny beats a main scope (live: Billing and Shipping)", () => {
  assert.equal(roleManagesPeople(BILLING), false);
  assert.equal(roleManagesPeople(SHIPPING), false);
});

test("an absent code on an additional role is a NO", () => {
  assert.equal(roleManagesPeople(BUYER_REQUIRES_APPROVAL), false);
  assert.equal(
    describeAccountRole(BUYER_REQUIRES_APPROVAL).details.some((d) => d.includes("add and remove")),
    false
  );
});

test("an absent code on a main-scope role defaults to allow", () => {
  assert.equal(roleManagesPeople({ id: 99, name: "Something Main", scope: "main", permissions: [] }), true);
});

// ── Card payments: three different gates, three different sentences ──────────

test("Manager and Billing are the invoice-settling roles (Tim, Sh03niVC)", () => {
  assert.equal(roleCanPayByCard("Manager"), true);
  assert.equal(roleCanPayByCard("billing"), true);
  assert.equal(roleCanPayByCard("Buyer"), false);
  assert.equal(roleCanPayByCard(null), false);
});

test("the card sentence is scoped to invoices, never a blanket 'cannot pay by credit card'", () => {
  // Shipping, Buyer and Restricted Buyer all hold use_company_card_in_checkout
  // in production and checkout does not block them. Printing "Cannot pay by
  // credit card" told them something the checkout contradicts.
  for (const row of [SHIPPING, BUYER_REQUIRES_APPROVAL]) {
    const role = describeAccountRole(row);
    assert.equal(role.canPayByCard, false);
    assert.equal(role.canPayByCardAtCheckout, true);
    assert.ok(role.details.includes("Not authorised to settle the account's invoices by card"));
    assert.ok(role.details.includes("Can pay by card at the checkout, where the site offers it"));
    assert.equal(
      role.details.some((d) => d === "Cannot pay by credit card"),
      false
    );
  }
});

test("a role that cannot order for the business is not told it can pay at the checkout", () => {
  const role = describeAccountRole({
    id: 90,
    name: "No Ordering",
    scope: "additional",
    permissions: ["use_company_card_in_checkout", { deny: ["submit_orders"], conditions: {} }],
  });
  assert.equal(role.canPayByCardAtCheckout, false);
  assert.equal(
    role.details.some((d) => d.startsWith("Can pay by card at the checkout")),
    false
  );
});

// ── The rest of the sentences ────────────────────────────────────────────────

test("Manager reads as full access, in plain words", () => {
  const manager = describeAccountRole(MANAGER);
  assert.equal(manager.canPayByCard, true);
  assert.equal(manager.canOrderForBusiness, true);
  assert.equal(manager.ordersNeedApproval, false);
  assert.equal(manager.seesAllOrders, true);
  assert.equal(manager.managesPeople, true);
  assert.ok(manager.details.includes("Can place orders on behalf of the business"));
  assert.ok(manager.details.includes("Authorised to settle the account's invoices by card"));
  assert.ok(manager.details.includes("Can see every order on the account"));
  assert.ok(manager.details.includes("Can add and remove the people on this account"));
});

test("saved cards and addresses are never claimed — the storefront has no screen for either", () => {
  // Card TdTuvgQq / Product Brief §3: saved cards belong to the person and live
  // in Stripe; /account has no saved-card route at all.
  const manager = describeAccountRole(MANAGER);
  assert.equal(
    manager.details.some((d) => d.toLowerCase().includes("saved card")),
    false
  );
  assert.equal(
    manager.details.some((d) => d.toLowerCase().includes("addresses")),
    false
  );
});

test("only the account emails something really sends are named", () => {
  // Order confirmations (storefront checkout) and shipment mail (portal
  // shipment-email.ts). Invoices, bills and credit notes have no sender wired
  // to them, so promising them is a lie the customer can check.
  const manager = describeAccountRole(MANAGER);
  assert.ok(
    manager.details.includes("Gets the account's order confirmations and delivery updates by email")
  );

  const shipping = describeAccountRole(SHIPPING);
  assert.ok(shipping.details.includes("Gets the account's delivery updates by email"));

  // Billing grants ONLY the invoice code, which nothing sends → no email line.
  const billing = describeAccountRole(BILLING);
  assert.equal(
    billing.details.some((d) => d.startsWith("Gets the account's")),
    false
  );
  assert.equal(
    billing.details.some((d) => d.includes("invoice") && d.includes("email")),
    false
  );
});

test("Billing can settle invoices but cannot manage people or see every order", () => {
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

test("manager role is matched by name, case-insensitively", () => {
  assert.equal(isManagerRole("Manager"), true);
  assert.equal(isManagerRole(" manager "), true);
  assert.equal(isManagerRole("Billing"), false);
  assert.equal(isManagerRole(null), false);
});
