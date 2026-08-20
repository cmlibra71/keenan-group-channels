import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldResetScroll } from "./scroll-reset.ts";

const base = { previousPath: "/", nextPath: "/pages/warranty", poppedPath: null, hash: "" };

test("a footer link to another page lands the reader at the top", () => {
  assert.equal(shouldResetScroll(base), true);
});

test("the first paint of a page load is left to the browser", () => {
  assert.equal(shouldResetScroll({ ...base, previousPath: null }), false);
});

test("paging or filtering the same page keeps the reader where they are", () => {
  assert.equal(
    shouldResetScroll({ ...base, previousPath: "/categories/fryers", nextPath: "/categories/fryers" }),
    false
  );
});

test("back and forward restore the position they left", () => {
  assert.equal(
    shouldResetScroll({ ...base, poppedPath: "/pages/warranty" }),
    false
  );
});

test("a pop that only changed the hash does not disarm the next real navigation", () => {
  // popstate recorded /pages/terms-conditions (a #fragment jump); the reader
  // then clicks through to another page, which must still land at the top.
  assert.equal(
    shouldResetScroll({
      previousPath: "/pages/terms-conditions",
      nextPath: "/pages/warranty",
      poppedPath: "/pages/terms-conditions",
      hash: "",
    }),
    true
  );
});

test("a link carrying a #fragment leaves the position to the anchor", () => {
  assert.equal(shouldResetScroll({ ...base, hash: "#10" }), false);
});
