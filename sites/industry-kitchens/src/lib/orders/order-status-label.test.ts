import { test } from "node:test";
import assert from "node:assert/strict";
import {
  customerOrderStage,
  ORDER_STAGES,
  KNOWN_ORDER_STATUSES,
} from "./order-status-label.ts";

// ── every status the business can put on an order, mapped deliberately ───────

test("orders that have only just been placed read as Placed", () => {
  assert.equal(customerOrderStage("pending"), "Placed");
});

test("everything mid-pipeline reads as Being prepared", () => {
  for (const status of [
    "awaiting_fulfillment",
    "processing",
    "deposit_paid",
    "deposit_paid___backordered",
    "backorder",
    "po_sent_ordered",
    "ship_ex_ws",
    "awaiting_shipment",
    "3pl_pending",
    "awaiting_payment",
    "eway_authorised",
    "net_terms_account",
    "manual_verification_required",
    "disputed",
  ]) {
    assert.equal(customerOrderStage(status), "Being prepared", status);
  }
});

test("an unpaid new order reads Placed, not Being prepared", () => {
  // `pending_payment` is what the portal's status lifecycle now puts on every new
  // unpaid order (Trello XJo20XmX). Telling a bank-transfer customer who has paid
  // nothing that we are "preparing" their order would be a lie.
  assert.equal(customerOrderStage("pending_payment"), "Placed");
  assert.equal(customerOrderStage("pending"), "Placed");
});

test("finance-company statuses read as Being prepared and never name the financier", () => {
  for (const status of ["silverchef", "skope_funding", "food_by_us"]) {
    assert.equal(customerOrderStage(status), "Being prepared", status);
  }
});

test("shipping states read in transit words", () => {
  assert.equal(customerOrderStage("shipped"), "On its way");
  assert.equal(customerOrderStage("partially_shipped"), "Partly on its way");
});

test("finished orders read as Complete, in both spellings and when closed", () => {
  assert.equal(customerOrderStage("complete"), "Complete");
  assert.equal(customerOrderStage("completed"), "Complete");
  assert.equal(customerOrderStage("closed"), "Complete");
});

test("a paused order reads as On hold, not the internal word 'holded'", () => {
  assert.equal(customerOrderStage("holded"), "On hold");
});

test("stopped orders read as Cancelled, in both spellings, declined included", () => {
  assert.equal(customerOrderStage("canceled"), "Cancelled");
  assert.equal(customerOrderStage("cancelled"), "Cancelled");
  assert.equal(customerOrderStage("declined"), "Cancelled");
});

test("returned money reads as Refunded", () => {
  assert.equal(customerOrderStage("refunded"), "Refunded");
  assert.equal(customerOrderStage("refund_in_progress"), "Refunded");
});

// ── the containment guarantee ────────────────────────────────────────────────

test("EVERY mapped status resolves to one of the eight permitted words", () => {
  for (const status of KNOWN_ORDER_STATUSES) {
    const stage: string = customerOrderStage(status);
    assert.ok(
      (ORDER_STAGES as readonly string[]).includes(stage),
      `${status} produced "${stage}", which is not a permitted customer word`
    );
  }
});

test("no output ever contains a raw underscore, a financier or internal shorthand", () => {
  const forbidden = [
    "silverchef",
    "skope",
    "food by us",
    "holded",
    "ship ex",
    "po sent",
    "eway",
    "3pl",
    "backorder",
    "fulfillment",
  ];
  const outputs = [...KNOWN_ORDER_STATUSES, "", "  ", "brand_new_zoey_status"].map((s) =>
    customerOrderStage(s).toLowerCase()
  );
  for (const out of outputs) {
    assert.ok(!out.includes("_"), `"${out}" leaked a snake_case value`);
    for (const word of forbidden) {
      assert.ok(!out.includes(word), `"${out}" leaked the internal word "${word}"`);
    }
  }
});

test("the portal's full order-status key set is covered by name, not by fallback", () => {
  // Mirrors ORDER_STATUS_LABEL in the portal (src/lib/orders/status-display.ts).
  // If the portal gains a status, this list is where it must be added here too.
  const portalKeys = [
    "eway_authorised",
    "net_terms_account",
    "backorder",
    "ship_ex_ws",
    "holded",
    "canceled",
    "deposit_paid___backordered",
    "po_sent_ordered",
    "silverchef",
    "pending",
    "closed",
    "refund_in_progress",
    "deposit_paid",
    "processing",
    "complete",
    "3pl_pending",
    "food_by_us",
    "skope_funding",
    "pending_payment",
    "awaiting_payment",
    "awaiting_fulfillment",
    "awaiting_shipment",
    "partially_shipped",
    "shipped",
    "completed",
    "cancelled",
    "declined",
    "refunded",
    "disputed",
    "manual_verification_required",
  ];
  for (const key of portalKeys) {
    assert.ok(
      KNOWN_ORDER_STATUSES.includes(key),
      `${key} exists in the portal but is not mapped here — it would silently fall back`
    );
  }
});

// ── the unknown / blank fallback ─────────────────────────────────────────────

test("blank, null, undefined and whitespace all fall back to Being prepared", () => {
  assert.equal(customerOrderStage(null), "Being prepared");
  assert.equal(customerOrderStage(undefined), "Being prepared");
  assert.equal(customerOrderStage(""), "Being prepared");
  assert.equal(customerOrderStage("   "), "Being prepared");
});

test("a status nobody has seen before falls back rather than leaking itself", () => {
  assert.equal(customerOrderStage("some_new_zoey_status"), "Being prepared");
  assert.equal(customerOrderStage("WAITING_ON_SUPPLIER"), "Being prepared");
});

test("casing and stray whitespace on a known status do not defeat the mapping", () => {
  assert.equal(customerOrderStage("  Shipped  "), "On its way");
  assert.equal(customerOrderStage("COMPLETE"), "Complete");
});
