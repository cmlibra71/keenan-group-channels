import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CUSTOMER_ORDER_NOTES_METAFIELD_KEY,
  readCustomerOrderNotes,
} from "./customer-order-notes.ts";

test("an order that has published nothing shows nothing", () => {
  assert.deepEqual(readCustomerOrderNotes(null), []);
  assert.deepEqual(readCustomerOrderNotes(undefined), []);
  assert.deepEqual(readCustomerOrderNotes({}), []);
  assert.deepEqual(readCustomerOrderNotes({ [CUSTOMER_ORDER_NOTES_METAFIELD_KEY]: "nope" }), []);
});

test("published notes come back oldest first, trimmed", () => {
  assert.deepEqual(
    readCustomerOrderNotes({
      [CUSTOMER_ORDER_NOTES_METAFIELD_KEY]: [
        { id: "a", note: " Your fridge ships Monday. ", at: "2026-08-14T01:00:00.000Z" },
        { id: "b", note: "Driver will call ahead.", at: "2026-08-15T01:00:00.000Z" },
      ],
    }),
    [
      { id: "a", note: "Your fridge ships Monday.", at: "2026-08-14T01:00:00.000Z" },
      { id: "b", note: "Driver will call ahead.", at: "2026-08-15T01:00:00.000Z" },
    ]
  );
});

test("a malformed entry costs the note, never the page", () => {
  assert.deepEqual(
    readCustomerOrderNotes({
      [CUSTOMER_ORDER_NOTES_METAFIELD_KEY]: [null, "text", { id: "x" }, { note: "no id" }, 7],
    }),
    []
  );
});

test("nothing but id, note and date can reach the customer", () => {
  // The portal never writes a status onto a published note (uvRji87U). Even if a future writer
  // tried, the reader would not carry it through.
  const [row] = readCustomerOrderNotes({
    [CUSTOMER_ORDER_NOTES_METAFIELD_KEY]: [
      { id: "a", note: "Thanks for the deposit.", at: null, status: "silverchef" },
    ],
  });
  assert.deepEqual(Object.keys(row).sort(), ["at", "id", "note"]);
  assert.equal(JSON.stringify(row).includes("silverchef"), false);
});

test("the internal memo is not this key and is never read here", () => {
  assert.deepEqual(
    readCustomerOrderNotes({ internal_memo: "below cost", staff_notes: "chase Tim" }),
    []
  );
});
