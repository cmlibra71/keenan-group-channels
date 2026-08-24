import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseRolePermissions,
  decidePermission,
  firstFailedOrderCondition,
  resolveEmailRecipientsFromRows,
  emailPermissionCodes,
  decideMainOnlyPermission,
  isMainOnlyCode,
  MAIN_ONLY_PERMISSIONS,
} from "./role-permissions.ts";

// ── parseRolePermissions ─────────────────────────────────────────────────────

test("parse: plain string array becomes grants", () => {
  const p = parseRolePermissions(["submit_orders", "view_company_orders"]);
  assert.equal(p.grants.has("submit_orders"), true);
  assert.equal(p.grants.has("view_company_orders"), true);
  assert.equal(p.denies.size, 0);
  assert.deepEqual(p.conditions, {});
});

test("parse: object entry carries deny + conditions; junk is ignored", () => {
  const p = parseRolePermissions([
    "view_company_orders",
    {
      deny: ["submit_orders", 42],
      conditions: {
        submit_orders: [
          { type: "cart_total_lt", value: 500 },
          { type: "bogus_type", value: 1 },
          { type: "mtd_total_lt", value: "2000" },
          { type: "ytd_total_lt", value: NaN },
        ],
      },
    },
  ]);
  assert.equal(p.denies.has("submit_orders"), true);
  assert.equal(p.denies.has("42"), false);
  assert.deepEqual(p.conditions.submit_orders, [
    { type: "cart_total_lt", value: 500 },
    { type: "mtd_total_lt", value: 2000 },
  ]);
});

test("parse: a grant beats a stale deny of the same code", () => {
  const p = parseRolePermissions(["submit_orders", { deny: ["submit_orders"] }]);
  assert.equal(decidePermission("submit_orders", p), true);
});

test("parse: non-array / null / garbage yields empty sets (never throws)", () => {
  for (const raw of [null, undefined, "x", 42, { deny: ["a"] }]) {
    const p = parseRolePermissions(raw);
    assert.equal(p.grants.size, 0);
    assert.equal(p.denies.size, 0);
  }
});

// ── decidePermission defaults ────────────────────────────────────────────────

test("decide: absent code defaults ALLOW (missing key must not brick checkout)", () => {
  const p = parseRolePermissions(["view_company_orders"]);
  assert.equal(decidePermission("submit_orders", p), true);
  assert.equal(decidePermission("submit_quotes", p), true);
  assert.equal(decidePermission("add_bill_to_address", p), true);
});

test("decide: submit_other_customer_orders defaults DENY", () => {
  assert.equal(decidePermission("submit_other_customer_orders", null), false);
  const p = parseRolePermissions(["view_company_orders"]);
  assert.equal(decidePermission("submit_other_customer_orders", p), false);
  const granted = parseRolePermissions(["submit_other_customer_orders"]);
  assert.equal(decidePermission("submit_other_customer_orders", granted), true);
});

test("decide: explicit deny blocks; explicit grant allows", () => {
  const p = parseRolePermissions([{ deny: ["submit_orders", "view_company_orders"] }]);
  assert.equal(decidePermission("submit_orders", p), false);
  assert.equal(decidePermission("view_company_orders", p), false);
});

test("decide: null parsed (no role / unparseable) allows everything but the default-deny code", () => {
  assert.equal(decidePermission("submit_orders", null), true);
  assert.equal(decidePermission("view_company_quotes", null), true);
  assert.equal(decidePermission("submit_other_customer_orders", null), false);
});

test("decide: email codes are grant-only (never satisfied by the default)", () => {
  assert.equal(decidePermission("receive_email_for_company_orders", null), false);
  const p = parseRolePermissions(["receive_email_for_company_orders"]);
  assert.equal(decidePermission("receive_email_for_company_orders", p), true);
  assert.equal(decidePermission("receive_email_for_company_order_shipments", p), false);
});

test("decide: convert_quotes_to_order_require_approval is a grant-only RESTRICTION", () => {
  assert.equal(decidePermission("convert_quotes_to_order_require_approval", null), false);
  const p = parseRolePermissions(["convert_quotes_to_order_require_approval"]);
  assert.equal(decidePermission("convert_quotes_to_order_require_approval", p), true);
});

// ── firstFailedOrderCondition ────────────────────────────────────────────────

test("conditions: cart under the limit passes, at/over fails", () => {
  const conds = [{ type: "cart_total_lt" as const, value: 500 }];
  assert.equal(
    firstFailedOrderCondition(conds, { cartTotal: 499.99, mtdTotal: null, ytdTotal: null }),
    null
  );
  assert.deepEqual(
    firstFailedOrderCondition(conds, { cartTotal: 500, mtdTotal: null, ytdTotal: null }),
    conds[0]
  );
  assert.deepEqual(
    firstFailedOrderCondition(conds, { cartTotal: 800, mtdTotal: null, ytdTotal: null }),
    conds[0]
  );
});

test("conditions: MTD/YTD compared when available, skipped (fail open) when null", () => {
  const conds = [
    { type: "mtd_total_lt" as const, value: 1000 },
    { type: "ytd_total_lt" as const, value: 5000 },
  ];
  // lookups failed → both skipped → pass
  assert.equal(
    firstFailedOrderCondition(conds, { cartTotal: 100, mtdTotal: null, ytdTotal: null }),
    null
  );
  // MTD over → first failure reported
  assert.deepEqual(
    firstFailedOrderCondition(conds, { cartTotal: 100, mtdTotal: 1500, ytdTotal: 100 }),
    conds[0]
  );
  // YTD over → second failure reported
  assert.deepEqual(
    firstFailedOrderCondition(conds, { cartTotal: 100, mtdTotal: 500, ytdTotal: 6000 }),
    conds[1]
  );
});

test("conditions: empty list always passes", () => {
  assert.equal(
    firstFailedOrderCondition([], { cartTotal: 1e9, mtdTotal: 1e9, ytdTotal: 1e9 }),
    null
  );
});

// ── resolveEmailRecipientsFromRows ───────────────────────────────────────────

const ORDER_CODES = emailPermissionCodes("orders");

test("email codes are derived from the doc type", () => {
  assert.deepEqual(emailPermissionCodes("order_shipments"), {
    company: "receive_email_for_company_order_shipments",
    own: "receive_email_for_own_company_order_shipments",
    cc: "receive_email_for_company_order_shipments_as_cc",
  });
});

test("recipients: company triple → To for every account document", () => {
  const rows = [
    { contact_id: 1, email: "billing@acme.test", permissions: [ORDER_CODES.company] },
    { contact_id: 2, email: "cc@acme.test", permissions: [ORDER_CODES.cc] },
    { contact_id: 3, email: "nothing@acme.test", permissions: ["submit_orders"] },
  ];
  const r = resolveEmailRecipientsFromRows(rows, {
    doc: "orders",
    ownerContactId: 99, // someone else's order — company/cc still apply
    primaryEmail: "purchaser@acme.test",
  });
  assert.deepEqual(r.to, ["billing@acme.test"]);
  assert.deepEqual(r.cc, ["cc@acme.test"]);
});

test("recipients: 'own' triple only fires for the owner's document", () => {
  const rows = [{ contact_id: 5, email: "own@acme.test", permissions: [ORDER_CODES.own] }];
  const owned = resolveEmailRecipientsFromRows(rows, {
    doc: "orders",
    ownerContactId: 5,
    primaryEmail: "checkout-email@other.test",
  });
  assert.deepEqual(owned.to, ["own@acme.test"]);
  const notOwned = resolveEmailRecipientsFromRows(rows, {
    doc: "orders",
    ownerContactId: 6,
    primaryEmail: null,
  });
  assert.deepEqual(notOwned.to, []);
});

test("recipients: purchaser's address excluded; To wins over CC; case-insensitive dedupe", () => {
  const rows = [
    { contact_id: 1, email: "Billing@Acme.test", permissions: [ORDER_CODES.company, ORDER_CODES.cc] },
    { contact_id: 2, email: "billing@acme.test", permissions: [ORDER_CODES.cc] },
    { contact_id: 3, email: "Purchaser@acme.test", permissions: [ORDER_CODES.company] },
    { contact_id: 4, email: null, permissions: [ORDER_CODES.company] },
  ];
  const r = resolveEmailRecipientsFromRows(rows, {
    doc: "orders",
    ownerContactId: 3,
    primaryEmail: "purchaser@acme.test",
  });
  assert.deepEqual(r.to, ["Billing@Acme.test"]);
  assert.deepEqual(r.cc, []);
});

test("recipients: a Billing-style role granted the invoices triple gets invoice mail, not shipment mail", () => {
  const INVOICE = emailPermissionCodes("order_invoices");
  const rows = [
    { contact_id: 10, email: "accounts@acme.test", permissions: [INVOICE.company] },
  ];
  const invoices = resolveEmailRecipientsFromRows(rows, {
    doc: "order_invoices",
    ownerContactId: 1,
    primaryEmail: "buyer@acme.test",
  });
  assert.deepEqual(invoices.to, ["accounts@acme.test"]);
  const shipments = resolveEmailRecipientsFromRows(rows, {
    doc: "order_shipments",
    ownerContactId: 1,
    primaryEmail: "buyer@acme.test",
  });
  assert.deepEqual(shipments.to, []);
  assert.deepEqual(shipments.cc, []);
});

// ── Main-contact-only codes (card H5JdsMrC) ──────────────────────────────────
// The live rows these are written against (prod 2026-08-24, 20,563 active
// memberships): Manager 20,105 (main, main-contact) · Buyer 300 (additional) ·
// Billing 131 (main, denies the bill-to trio) · (Legacy Account Role) 10 (scope
// null, main-contact) · Shipping 6 (main, denies the trio) · Restricted Buyer 6 ·
// Buyer Requires Approval 3 · (Deprecated) Account Admin 1 (additional, GRANTS
// the bill-to trio).

test("main-only: the ship-to trio joins Zoey's eleven", () => {
  for (const code of [
    "add_ship_to_address",
    "edit_ship_to_address",
    "remove_ship_to_address",
    "add_bill_to_address",
    "edit_bill_to_address",
    "remove_bill_to_address",
  ]) {
    assert.equal(isMainOnlyCode(code), true, code);
  }
  assert.equal(MAIN_ONLY_PERMISSIONS.size, 14);
  assert.equal(isMainOnlyCode("submit_orders"), false);
  assert.equal(isMainOnlyCode("add_shipping_address_in_checkout"), false);
});

test("main-only: an ABSENT code is refused on an Additional Contact Role", () => {
  // "Buyer" — the 300-member role the card is actually about. It grants ordering
  // and never mentions any address book code.
  const buyer = parseRolePermissions([
    "submit_orders",
    "submit_quotes",
    { deny: ["view_company_orders"], conditions: {} },
  ]);
  const ctx = { scope: "additional" as const, isMainContact: false };
  assert.equal(decideMainOnlyPermission("add_ship_to_address", buyer, ctx), false);
  assert.equal(decideMainOnlyPermission("edit_ship_to_address", buyer, ctx), false);
  assert.equal(decideMainOnlyPermission("remove_ship_to_address", buyer, ctx), false);
  // …while the permissive default still applies to everything that is NOT main-only.
  assert.equal(decidePermission("add_shipping_address_in_checkout", buyer), true);
});

test("main-only: an ABSENT code is allowed on a Main Contact Role", () => {
  const manager = parseRolePermissions(["add_bill_to_address", "submit_orders"]);
  const ctx = { scope: "main" as const, isMainContact: true };
  assert.equal(decideMainOnlyPermission("add_ship_to_address", manager, ctx), true);
});

test("main-only: the account's MAIN CONTACT is never locked out by a role-data gap", () => {
  // "(Legacy Account Role)": scope NULL, permissions ["view_company_orders"],
  // 10 live memberships — every one of them flagged as the account's main contact.
  const legacy = parseRolePermissions(["view_company_orders"]);
  assert.equal(
    decideMainOnlyPermission("edit_ship_to_address", legacy, { scope: null, isMainContact: true }),
    true
  );
  // The same role held by somebody who is NOT the main contact is refused.
  assert.equal(
    decideMainOnlyPermission("edit_ship_to_address", legacy, { scope: null, isMainContact: false }),
    false
  );
});

test("main-only: an explicit DENY beats a main-contact role", () => {
  // "Billing" and "Shipping" are both `main` scope and both untick the bill-to
  // trio in production. They stay refused, which is Zoey's own behaviour.
  const billing = parseRolePermissions([
    "submit_orders",
    { deny: ["add_bill_to_address", "edit_bill_to_address", "remove_bill_to_address"], conditions: {} },
  ]);
  const ctx = { scope: "main" as const, isMainContact: true };
  assert.equal(decideMainOnlyPermission("add_bill_to_address", billing, ctx), false);
  // Its ship-to counterpart is absent, so the main-contact rule still allows it —
  // and the address book asks for BOTH, so Billing stays refused there.
  assert.equal(decideMainOnlyPermission("add_ship_to_address", billing, ctx), true);
});

test("main-only: an explicit GRANT beats an additional-scope role", () => {
  // "(Deprecated) Account Admin": additional scope, bill-to trio granted outright.
  const deprecated = parseRolePermissions([
    "add_bill_to_address",
    "edit_bill_to_address",
    "remove_bill_to_address",
  ]);
  const ctx = { scope: "additional" as const, isMainContact: false };
  assert.equal(decideMainOnlyPermission("add_bill_to_address", deprecated, ctx), true);
  // Its ship-to half was never granted, so the address book still refuses it.
  assert.equal(decideMainOnlyPermission("add_ship_to_address", deprecated, ctx), false);
});

test("main-only: no role at all is not a manager", () => {
  assert.equal(
    decideMainOnlyPermission("add_ship_to_address", null, { scope: null, isMainContact: false }),
    false
  );
});
