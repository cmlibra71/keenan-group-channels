import { test } from "node:test";
import assert from "node:assert/strict";
import { decideQuoteLineWrite, type QuoteLineWriteInput } from "./addon-line-write";

const base: QuoteLineWriteInput = {
  addonsPosted: true,
  hadAddons: false,
  resolvedAddonCount: 0,
  isBundleBuild: false,
  lineNotes: null,
  existingNote: null,
  ownedNote: null,
};
const at = (over: Partial<QuoteLineWriteInput>) => decideQuoteLineWrite({ ...base, ...over });

// ── A TILE must never destroy a configuration built on the product page ────────────────

test("a tile add on a configured line counts up and touches nothing else", () => {
  // `master-leaves.tsx` calls addToQuote(id, null): no panel was on screen, so there is no
  // way for the shopper to say "keep my blades" and no reason to read this as a clear-down.
  const out = at({
    addonsPosted: false,
    hadAddons: true,
    resolvedAddonCount: 0,
    existingNote: "Slicers: Slicer 4mm",
    ownedNote: "Slicers: Slicer 4mm",
  });
  assert.equal(out.incrementsQuantity, true);
  assert.equal(out.clearsAddons, false);
  assert.equal(out.writesNote, false);
});

test("a tile add on a plain line still just counts up", () => {
  assert.deepEqual(at({ addonsPosted: false }), {
    incrementsQuantity: true,
    clearsAddons: false,
    writesNote: false,
  });
});

// ── A deliberate clear-down FROM THE PANEL still clears ────────────────────────────────

test("un-ticking every extra on the product page removes the record", () => {
  const out = at({
    addonsPosted: true,
    hadAddons: true,
    resolvedAddonCount: 0,
    existingNote: "Slicers: Slicer 4mm",
    ownedNote: "Slicers: Slicer 4mm",
    lineNotes: null,
  });
  assert.equal(out.clearsAddons, true);
  assert.equal(out.writesNote, true); // the note we own is cleared with it
  assert.equal(out.incrementsQuantity, false); // a re-configuration, not a second machine
});

test("re-configuring replaces the line rather than stacking a second machine onto it", () => {
  const out = at({
    hadAddons: true,
    resolvedAddonCount: 2,
    lineNotes: "Slicers: Slicer 6mm",
    existingNote: "Slicers: Slicer 4mm",
    ownedNote: "Slicers: Slicer 4mm",
  });
  assert.equal(out.incrementsQuantity, false);
  assert.equal(out.writesNote, true);
  assert.equal(out.clearsAddons, false);
});

test("pressing the button again with the SAME configuration counts up", () => {
  const out = at({
    hadAddons: true,
    resolvedAddonCount: 1,
    lineNotes: "Slicers: Slicer 4mm",
    existingNote: "Slicers: Slicer 4mm",
    ownedNote: "Slicers: Slicer 4mm",
  });
  assert.equal(out.incrementsQuantity, true);
});

// ── A REP'S TYPED COMMENT IS NEVER OVERWRITTEN (quotes.md, card 7bmpuqei) ──────────────

test("a comment a rep typed survives a re-configuration", () => {
  const out = at({
    hadAddons: true,
    resolvedAddonCount: 2,
    lineNotes: "Slicers: Slicer 6mm",
    existingNote: "Ring Kate re gas connection before quoting",
    ownedNote: "Slicers: Slicer 4mm",
  });
  assert.equal(out.writesNote, false);
  // The picks still land structurally, so nothing about the configuration is lost.
  assert.equal(out.incrementsQuantity, false);
});

test("a comment a rep typed survives a clear-down — it is never nulled", () => {
  const out = at({
    addonsPosted: true,
    hadAddons: true,
    resolvedAddonCount: 0,
    lineNotes: null,
    existingNote: "Customer collecting Friday",
    ownedNote: null,
  });
  assert.equal(out.writesNote, false);
  assert.equal(out.clearsAddons, true);
});

test("a line with no comment at all is ours to write", () => {
  const out = at({ resolvedAddonCount: 1, lineNotes: "Slicers: Slicer 4mm", existingNote: null });
  assert.equal(out.writesNote, true);
  assert.equal(out.incrementsQuantity, false);
});

test("an empty-string comment counts as no comment", () => {
  const out = at({ resolvedAddonCount: 1, lineNotes: "Slicers: Slicer 4mm", existingNote: "" });
  assert.equal(out.writesNote, true);
});

// ── Bundles keep behaving as card 7bmpuqei set them up ─────────────────────────────────

test("a bundle build is a configuration in its own right", () => {
  const out = at({
    isBundleBuild: true,
    lineNotes: "Bay 1: Door\nBay 2: Drawers",
    existingNote: null,
  });
  assert.equal(out.incrementsQuantity, false);
  assert.equal(out.writesNote, true);
});

test("the same bundle build twice counts up", () => {
  const out = at({
    isBundleBuild: true,
    lineNotes: "Bay 1: Door",
    existingNote: "Bay 1: Door",
    ownedNote: "Bay 1: Door",
  });
  assert.equal(out.incrementsQuantity, true);
});
