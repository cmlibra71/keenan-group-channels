import test from "node:test";
import assert from "node:assert/strict";
import { applyBorrowedImages, borrowedImageFor } from "./borrowed-image";

/** Real production URLs (2026-09-18) so the allowlist is exercised, not mocked. */
const OWN = "https://keenan-group-images.s3.ap-southeast-2.amazonaws.com/categories/250.jpg";
/** Combi Ovens (28987, 687 products): the lowest-id product's photograph. */
const BORROWED = "https://keenan-group-images.s3.ap-southeast-2.amazonaws.com/products/35530/0.jpg";
const BORROWED_2 =
  "https://keenan-group-images.s3.ap-southeast-2.amazonaws.com/products/37897/0.jpg";
/** A real file on an origin `/api/image` refuses: 403 there, broken-image glyph on screen. */
const OFF_ALLOWLIST = "https://images.example.com/nice-oven.jpg";

test("a record with its own picture keeps it, even when a candidate exists", () => {
  assert.equal(
    borrowedImageFor({ id: 230, image_url: OWN }, { 230: [BORROWED] }),
    OWN,
    "Chris's rule 3: a page whose own picture is set still shows its own"
  );
});

test("a pictureless record borrows the FIRST candidate", () => {
  assert.equal(
    borrowedImageFor({ id: 28987, image_url: null }, { 28987: [BORROWED, BORROWED_2] }),
    BORROWED
  );
});

test("an unusable candidate is skipped, not shown", () => {
  // /api/image 403s anything outside our buckets and a 403 draws the browser's
  // broken-image glyph — the tile gRLRF8yu promised Steve we would not ship.
  assert.equal(
    borrowedImageFor({ id: 28685, image_url: "" }, { 28685: [OFF_ALLOWLIST, BORROWED_2] }),
    BORROWED_2
  );
});

test("a record with neither picture nor products resolves to null", () => {
  assert.equal(borrowedImageFor({ id: 510, image_url: null }, {}), null);
  assert.equal(borrowedImageFor({ id: 510, image_url: null }, { 510: [] }), null);
  assert.equal(borrowedImageFor({ id: 510, image_url: null }, { 510: [OFF_ALLOWLIST] }), null);
});

test("a record whose OWN picture is unusable falls through to a borrowed one", () => {
  assert.equal(
    borrowedImageFor({ id: 99, image_url: OFF_ALLOWLIST }, { 99: [BORROWED] }),
    BORROWED
  );
});

test("a missing record does not throw", () => {
  assert.equal(borrowedImageFor(null, { 1: [BORROWED] }), null);
  assert.equal(borrowedImageFor(undefined, {}), null);
});

test("applyBorrowedImages fills only the empty rows and leaves the rest identical", () => {
  const rows = [
    { id: 230, name: "Combi Ovens", image_url: OWN },
    { id: 28987, name: "Combi Ovens", image_url: null },
    { id: 510, name: "Centaur", image_url: null },
  ];
  const out = applyBorrowedImages(rows, { 28987: [BORROWED] });
  assert.equal(out[0], rows[0], "an untouched row is returned by reference");
  assert.equal(out[1].image_url, BORROWED);
  assert.equal(out[1].name, "Combi Ovens", "every other field travels with the row");
  assert.equal(out[2].image_url, null, "nothing to borrow stays nothing to borrow");
});

test("applyBorrowedImages normalises an unusable picture to null", () => {
  // So the caller's "no picture" test and this module's cannot disagree about
  // the same row and draw a broken image between them.
  const out = applyBorrowedImages([{ id: 5, image_url: OFF_ALLOWLIST }], {});
  assert.equal(out[0].image_url, null);
});

test("applyBorrowedImages does not mutate the rows it was given", () => {
  const rows = [{ id: 28987, image_url: null as string | null }];
  applyBorrowedImages(rows, { 28987: [BORROWED] });
  assert.equal(rows[0].image_url, null, "nothing is written back, here or to the database");
});
