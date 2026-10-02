import { test } from "node:test";
import assert from "node:assert/strict";
import { wishlistWord, fillWishlistWord } from "./wishlist-copy.ts";

test("a word is a non-empty string prop — there is no built-in default", () => {
  assert.equal(wishlistWord({ label_add: "Add to Wishlist" }, "label_add"), "Add to Wishlist");
  assert.equal(wishlistWord({ label_add: "  Save  " }, "label_add"), "Save");
  assert.equal(wishlistWord({ label_add: "   " }, "label_add"), null, "blank = print nothing");
  assert.equal(wishlistWord({}, "label_add"), null, "missing = print nothing (no code default)");
  assert.equal(wishlistWord({ label_add: 7 }, "label_add"), null);
  assert.equal(wishlistWord(null, "label_add"), null);
});

test("placeholders fill as text; unknown ones are left visible", () => {
  assert.equal(
    fillWishlistWord("{product} has been added to your wishlist.", { product: "Hallde RG-100" }),
    "Hallde RG-100 has been added to your wishlist."
  );
  assert.equal(fillWishlistWord("{count} item(s)", { count: 3 }), "3 item(s)");
  assert.equal(fillWishlistWord("{prodcut} added", { product: "X" }), "{prodcut} added");
  assert.equal(fillWishlistWord("<b>{product}</b>", { product: "<script>" }), "<b><script></b>", "a plain string — React escapes it");
});

import { accountWishlistNavLabel } from "./wishlist-copy.ts";
test("the account-menu label is the master's label_nav prop, else none", () => {
  const master = (label?: unknown) => ({
    v: 1,
    root: { id: "r", kind: "element", tag: "div", children: [{ id: "h", kind: "element", tag: "h1" }, { id: "n", kind: "component", componentKey: "wishlist-items", props: label === undefined ? {} : { label_nav: label } }] },
  });
  assert.equal(accountWishlistNavLabel(master({ kind: "static", value: " My Wishlist " })), "My Wishlist");
  assert.equal(accountWishlistNavLabel(master()), null);
  assert.equal(accountWishlistNavLabel(master({ kind: "static", value: "  " })), null);
  assert.equal(accountWishlistNavLabel(master({ kind: "binding", path: "x" })), null, "only static words");
  assert.equal(accountWishlistNavLabel(null), null);
  assert.equal(accountWishlistNavLabel(undefined), null);
});
