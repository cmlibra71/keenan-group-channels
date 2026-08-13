import { test } from "node:test";
import assert from "node:assert/strict";
import { kitNoteWrite, mergeKitAttributes, readOwnKitNote } from "./kit-line.ts";

const KIT = { kit_kind: "bundle", kit_selection: [{ group: "Left bay", product_id: 12 }], kit_note: "Left bay: Solid door" };

test("the attributes bag is MERGED — another card's keys survive a storefront add", () => {
  const existing = {
    indent: { at: "2026-08-01T00:00:00.000Z", by: "rep@keenan" },
    custom_line: { approved_by: 4 },
    zoey_item_id: "9911",
    parent_item_id: "9910",
    product_type: "simple",
  };
  const merged = mergeKitAttributes(existing, KIT)!;
  assert.deepEqual(merged.indent, existing.indent);
  assert.deepEqual(merged.custom_line, existing.custom_line);
  assert.equal(merged.zoey_item_id, "9911");
  assert.equal(merged.parent_item_id, "9910");
  assert.equal(merged.product_type, "simple");
  assert.equal(merged.kit_kind, "bundle");
});

test("a jsonb bag that arrived as a JSON string is merged, not discarded", () => {
  const merged = mergeKitAttributes(JSON.stringify({ indent: { at: "x", by: null } }), KIT)!;
  assert.deepEqual(merged.indent, { at: "x", by: null });
});

test("nothing to write means the column is not written at all", () => {
  assert.equal(mergeKitAttributes({ indent: {} }, null), null);
});

test("a re-configured bundle replaces its own keys and only its own", () => {
  const first = mergeKitAttributes({ indent: { at: "x", by: null } }, KIT)!;
  const second = mergeKitAttributes(first, { ...KIT, kit_selection: [{ group: "Left bay", product_id: 11 }] })!;
  assert.deepEqual(second.kit_selection, [{ group: "Left bay", product_id: 11 }]);
  assert.deepEqual(second.indent, { at: "x", by: null });
});

test("an empty line comment gets the configuration", () => {
  assert.deepEqual(kitNoteWrite(null, null, "Left bay: Solid door"), { customerNotes: "Left bay: Solid door" });
  assert.deepEqual(kitNoteWrite("   ", {}, "Left bay: Solid door"), { customerNotes: "Left bay: Solid door" });
});

test("a rep's line comment is NEVER overwritten — the customer is reading it", () => {
  assert.equal(kitNoteWrite("Ring Dave before dispatch", { kit_note: "Left bay: Solid door" }, "Left bay: Glass door"), null);
  assert.equal(kitNoteWrite("Ring Dave before dispatch", null, "Left bay: Solid door"), null);
});

test("our own previous configuration IS refreshed when the customer re-configures", () => {
  assert.deepEqual(
    kitNoteWrite("Left bay: Solid door", { kit_note: "Left bay: Solid door" }, "Left bay: Glass door"),
    { customerNotes: "Left bay: Glass door" }
  );
});

test("a grouped kit writes no line comment at all", () => {
  assert.equal(kitNoteWrite(null, null, null), null);
  assert.equal(kitNoteWrite("Left bay: Solid door", { kit_note: "Left bay: Solid door" }, null), null);
});

test("the ownership marker is read defensively", () => {
  assert.equal(readOwnKitNote(null), null);
  assert.equal(readOwnKitNote({ kit_note: "   " }), null);
  assert.equal(readOwnKitNote("not json"), null);
  assert.equal(readOwnKitNote({ kit_note: "x" }), "x");
});
