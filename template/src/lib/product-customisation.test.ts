import test from "node:test";
import assert from "node:assert/strict";

import {
  customisationRefusal,
  storefrontOwnsLineComment,
  priorStorefrontNote,
} from "./product-customisation";
import type { ProductAddons } from "@keenan/services/product-addons";

const required: ProductAddons = {
  groups: [
    {
      key: "instructions",
      label: "Instructions",
      control: "text",
      required: true,
      placeholder: null,
      maxLength: 500,
      multiline: true,
      options: [],
    },
  ],
};

const optional: ProductAddons = {
  groups: [{ ...required.groups[0], required: false }],
};

test("a product that asks nothing refuses nothing, however it is pressed", () => {
  assert.equal(customisationRefusal(null, undefined, "quote"), null);
  assert.equal(customisationRefusal(null, {}, "cart"), null);
  assert.equal(customisationRefusal(optional, undefined, "quote"), null);
  assert.equal(customisationRefusal(optional, {}, "cart"), null);
});

test("an answered required field is not refused", () => {
  assert.equal(
    customisationRefusal(required, { instructions: ["1200mm bench"] }, "quote"),
    null
  );
});

test("an empty or whitespace answer is refused, naming the field", () => {
  assert.equal(
    customisationRefusal(required, { instructions: [""] }, "quote"),
    "Please fill in Instructions before adding this to your quote."
  );
  assert.equal(
    customisationRefusal(required, { instructions: ["   "] }, "cart"),
    "Please fill in Instructions before adding this to your cart."
  );
  assert.equal(
    customisationRefusal(required, {}, "cart"),
    "Please fill in Instructions before adding this to your cart."
  );
});

// THE REGRESSION THIS FILE EXISTS FOR. A tile, a related-products rail and the
// authored `product-card` master press the buy button with the product id alone.
// While a missing argument meant "nothing to check", those buttons silently
// SUCCEEDED on a product that requires an answer — the bare quote line card
// kyMjCmAw exists to prevent — instead of getting the plain refusal 7vu2iEEZ's
// tile rule promises.
test("a caller that offered no panel is refused too, and told where the field is", () => {
  assert.equal(
    customisationRefusal(required, undefined, "quote"),
    "Please open the product page and fill in Instructions before adding this to your quote."
  );
  assert.equal(
    customisationRefusal(required, undefined, "cart"),
    "Please open the product page and fill in Instructions before adding this to your cart."
  );
  // null is an explicit "the panel was offered and answered nothing", not an
  // absent argument, so it keeps the on-page wording.
  assert.equal(
    customisationRefusal(required, null, "quote"),
    "Please fill in Instructions before adding this to your quote."
  );
});

test("every unanswered field is named, in the author's order", () => {
  const two: ProductAddons = {
    groups: [
      required.groups[0],
      { ...required.groups[0], key: "engraving", label: "Engraving" },
    ],
  };
  assert.equal(
    customisationRefusal(two, undefined, "quote"),
    "Please open the product page and fill in Instructions and Engraving before adding this to your quote."
  );
});

// ── Whose comment is it? (7bmpuqei's rule on `quote-editor`) ─────────────────

test("an empty comment is always the storefront's to write", () => {
  assert.equal(storefrontOwnsLineComment(null, null), true);
  assert.equal(storefrontOwnsLineComment("", { addon_selection: [] }), true);
  assert.equal(storefrontOwnsLineComment("   ", null), true);
});

test("the note the storefront wrote last time is its own to replace", () => {
  const attrs = { addon_note: "Instructions: 1200mm bench", addon_selection: [{}] };
  assert.equal(storefrontOwnsLineComment("Instructions: 1200mm bench", attrs), true);
});

test("A COMMENT A REP TYPED IS NEVER OVERWRITTEN", () => {
  // The workflow this product exists for: the customer describes a fabrication,
  // the rep annotates and prices it, the customer presses Add to Quote again.
  const attrs = { addon_note: "Instructions: 1200mm bench", addon_selection: [{}] };
  assert.equal(
    storefrontOwnsLineComment("Quoted at $2,400 — 2mm 304, Tim to confirm splashback", attrs),
    false
  );
});

test("a line with no marker is ours only if the STOREFRONT configured it", () => {
  // Every line written before the marker existed. A kit or addon line is one we
  // wrote; a plain line carrying a comment is a rep's.
  assert.equal(storefrontOwnsLineComment("Bundle: 1 x Fryer", { kit_kind: "bundle" }), true);
  assert.equal(storefrontOwnsLineComment("Instructions: 800mm", { addon_selection: [{}] }), true);
  assert.equal(storefrontOwnsLineComment("Rep: chase Tim on freight", { indent: true }), false);
  assert.equal(storefrontOwnsLineComment("Rep: chase Tim on freight", null), false);
});

test("'did the configuration change' is measured against OUR note, not the rep's", () => {
  const attrs = { addon_note: "Instructions: 1200mm bench", addon_selection: [{}] };
  // A rep has taken the Comment. Re-pressing with the SAME instruction must still
  // read as unchanged, or the correction would be counted as a second unit.
  assert.equal(priorStorefrontNote("Quoted at $2,400", attrs), "Instructions: 1200mm bench");
  // No marker: fall back to the comment on the line, exactly as before.
  assert.equal(priorStorefrontNote("Instructions: 800mm", null), "Instructions: 800mm");
  assert.equal(priorStorefrontNote(null, null), "");
});
