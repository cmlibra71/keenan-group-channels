import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extrasPanelGroups,
  customisationGroups,
  customisationOffered,
  customisationDefinition,
  extrasDefinition,
  buyableAddons,
  postsConfiguration,
} from "./addon-panel";
import { readProductAddons } from "@keenan/services/product-addons";

const mixed = {
  addons: {
    groups: [
      {
        key: "slicers",
        label: "Slicers",
        control: "checkbox",
        options: [{ key: "s4", label: "Slicer 4mm", price: "245.00" }],
      },
      {
        key: "instructions",
        label: "Instructions",
        control: "text",
        required: true,
        options: [],
      },
      {
        key: "hopper",
        label: "Feed hopper",
        control: "radio",
        required: true,
        options: [{ key: "large", label: "Large hopper", price: "480.00" }],
      },
    ],
  },
};

test("the extras panel draws the priced controls and leaves the text box to kyMjCmAw", () => {
  const groups = extrasPanelGroups(readProductAddons(mixed));
  assert.deepEqual(
    groups.map((g) => g.key),
    ["slicers", "hopper"]
  );
});

test("a product whose ONLY group is a text box gives this panel nothing to draw", () => {
  const textOnly = readProductAddons({
    addons: { groups: [{ key: "i", label: "Instructions", control: "text", options: [] }] },
  });
  assert.equal(extrasPanelGroups(textOnly).length, 0);
});

test("no definition, no groups", () => {
  assert.deepEqual(extrasPanelGroups(null), []);
  assert.deepEqual(extrasPanelGroups(undefined), []);
});

// ── The price gate applies to the PRICED half only (card kyMjCmAw) ───────────
//
// `addonPanelShown` is false on a product whose price is hidden or zero, and every
// reason for that is about money. Custom Stainless Steel is quote-only at $0, so a
// text group that obeyed the price rule would be unreachable on the one product the
// feature was built for.

test("the customisation panel draws the text boxes and leaves the priced controls alone", () => {
  const groups = customisationGroups(readProductAddons(mixed));
  assert.deepEqual(
    groups.map((g) => g.key),
    ["instructions"]
  );
});

test("a $0 product keeps its text group and loses its priced ones", () => {
  const defn = readProductAddons(mixed);
  const buyable = buyableAddons(defn, false);
  assert.deepEqual(
    (buyable?.groups ?? []).map((g) => g.key),
    ["instructions"]
  );
  // ...and the priced half is genuinely gone, so a required hopper cannot be refused
  // over a control the shopper was never shown.
  assert.equal(extrasDefinition(defn, false), null);
  assert.deepEqual(
    (customisationDefinition(defn)?.groups ?? []).map((g) => g.key),
    ["instructions"]
  );
});

test("a priced product keeps both halves, in the AUTHOR's order", () => {
  const buyable = buyableAddons(readProductAddons(mixed), true);
  assert.deepEqual(
    (buyable?.groups ?? []).map((g) => g.key),
    ["slicers", "instructions", "hopper"]
  );
});

test("a product with only priced groups on a $0 price is enforced against nothing", () => {
  const pricedOnly = readProductAddons({
    addons: {
      groups: [
        {
          key: "hopper",
          label: "Feed hopper",
          control: "radio",
          required: true,
          options: [{ key: "large", label: "Large hopper", price: "480.00" }],
        },
      ],
    },
  });
  assert.equal(buyableAddons(pricedOnly, false), null);
  assert.equal(customisationOffered(pricedOnly), false);
});

test("a buy control posts the configuration when EITHER half is on screen", () => {
  const defn = readProductAddons(mixed);
  // the priced panel is on screen
  assert.equal(postsConfiguration(true, defn), true);
  // the priced panel is hidden by the price, but the text box is still there
  assert.equal(postsConfiguration(false, defn), true);
  // nothing to answer at all — the control posts nothing, so a listing tile can
  // never read as a deliberate clear-down
  assert.equal(postsConfiguration(false, null), false);
});
