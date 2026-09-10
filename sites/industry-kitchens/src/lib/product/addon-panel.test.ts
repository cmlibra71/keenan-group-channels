import { test } from "node:test";
import assert from "node:assert/strict";
import { extrasPanelGroups } from "./addon-panel";
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
