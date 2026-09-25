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
  missingAnswerSentence,
  questionGroups,
  productPageForRefusal,
  tileRefusalDestination,
  quoteLinePicks,
  chosenOptionLines,
} from "./addon-panel";
import { gasTypeGroup, readProductAddons, unansweredAddonGroups } from "@keenan/services/product-addons";

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

// ── The verb has to fit the control (card kyMjCmAw) ─────────────────────────

test("a missing INSTRUCTION is filled in, not chosen", () => {
  assert.equal(
    missingAnswerSentence(readProductAddons(mixed), ["Instructions"], "quote"),
    "Please fill in Instructions before adding this to your quote."
  );
  assert.equal(
    missingAnswerSentence(readProductAddons(mixed), ["Instructions"], "cart"),
    "Please fill in Instructions before adding this to your cart."
  );
});

test("a missing priced group keeps 0CDcCYmO's own wording, unchanged", () => {
  assert.equal(
    missingAnswerSentence(readProductAddons(mixed), ["Feed hopper"], "quote"),
    "Please choose Feed hopper before adding this to your quote."
  );
});

test("both missing names the priced one first, as the actions refuse", () => {
  assert.equal(
    missingAnswerSentence(readProductAddons(mixed), ["Instructions", "Feed hopper"], "quote"),
    "Please choose Feed hopper before adding this to your quote."
  );
});

test("nothing missing, nothing said", () => {
  assert.equal(missingAnswerSentence(readProductAddons(mixed), [], "quote"), null);
  assert.equal(missingAnswerSentence(null, [""], "quote"), null);
});

// ── Gas Type: a no-charge QUESTION, not an extra (card tkvntxsq) ──────────────

const gasFryer = readProductAddons({
  addons: {
    groups: [
      gasTypeGroup(),
      {
        key: "baskets",
        label: "Baskets",
        control: "checkbox",
        options: [{ key: "twin", label: "Twin baskets", price: "95.00" }],
      },
    ],
  },
});

test("Gas Type is a question: drawn by the question block, never under 'Optional extras'", () => {
  assert.deepEqual(questionGroups(gasFryer).map((g) => g.key), ["gas_type"]);
  assert.deepEqual(extrasPanelGroups(gasFryer).map((g) => g.key), ["baskets"]);
  assert.deepEqual(questionGroups(readProductAddons(mixed)), []);
  assert.deepEqual(questionGroups(null), []);
});

test("a hidden-price or $0 gas product is still refused until the gas type is chosen", () => {
  const def = extrasDefinition(gasFryer, false);
  assert.deepEqual((def?.groups ?? []).map((g) => g.key), ["gas_type"]);
  assert.deepEqual(unansweredAddonGroups(def, {}), ["Gas Type"]);
  assert.deepEqual(unansweredAddonGroups(def, { gas_type: ["natural_gas"] }), []);
  // ...and the buy controls post the answer, because the provider offers the question.
  assert.deepEqual((buyableAddons(gasFryer, false)?.groups ?? []).map((g) => g.key), ["gas_type"]);
});

test("a priced gas product refuses on the question and the priced extras alike", () => {
  const def = extrasDefinition(gasFryer, true);
  assert.deepEqual((def?.groups ?? []).map((g) => g.key), ["gas_type", "baskets"]);
});

test("the sentence for a missing gas type is a CHOOSE sentence", () => {
  assert.equal(
    missingAnswerSentence(gasFryer, ["Gas Type"], "cart"),
    "Please choose Gas Type before adding this to your cart."
  );
});

// ── A refused TILE add goes to the product page (card tkvntxsq) ──────────────

test("the product page is built from a plain url_path, and nothing else", () => {
  assert.equal(
    productPageForRefusal("anets-35as-silverline-gas-tube-fryer-16-18-litre-capacity"),
    "/products/anets-35as-silverline-gas-tube-fryer-16-18-litre-capacity"
  );
  assert.equal(productPageForRefusal("/leading-slash"), "/products/leading-slash");
  // Leading slashes are stripped, so even a protocol-relative value lands INSIDE /products/.
  assert.equal(productPageForRefusal("//evil.com"), "/products/evil.com");
  for (const bad of ["", "  ", null, undefined, 42, "\\evil.com", "a\\b", "javascript:alert(1)", "a?b=1", "a#x", "a b"]) {
    assert.equal(productPageForRefusal(bad), null, String(bad));
  }
});

test("a tile only ever navigates to a /products/ path the action built", () => {
  assert.equal(tileRefusalDestination({ error: "x", productPage: "/products/fryer" }), "/products/fryer");
  assert.equal(tileRefusalDestination({ error: "x" }), null);
  assert.equal(tileRefusalDestination({ error: "x", productPage: "https://evil.com/products/x" }), null);
  assert.equal(tileRefusalDestination({ error: "x", productPage: "/products//evil.com" }), null);
  assert.equal(tileRefusalDestination({ error: "x", productPage: "/account" }), null);
  assert.equal(tileRefusalDestination(null), null);
  assert.equal(tileRefusalDestination("nope"), null);
});

// ── The choice reaches every email goods list (card tkvntxsq) ────────────────

const lpgPick = [
  { groupKey: "gas_type", groupLabel: "Gas Type", optionKey: "lpg", optionLabel: "LPG", price: "0.00", url: null },
];

test("a quote line's picks are read off attributes, object or double-encoded", () => {
  assert.deepEqual(chosenOptionLines(quoteLinePicks({ addon_selection: lpgPick })), ["Gas Type: LPG"]);
  assert.deepEqual(
    chosenOptionLines(quoteLinePicks(JSON.stringify({ addon_selection: lpgPick }))),
    ["Gas Type: LPG"]
  );
  assert.deepEqual(quoteLinePicks(null), []);
  assert.deepEqual(quoteLinePicks("not json"), []);
  assert.deepEqual(quoteLinePicks({ kit_kind: "grouped" }), []);
});

test("the email lines are the order line's own words: one per group, no money", () => {
  const lines = chosenOptionLines([
    ...lpgPick,
    { groupKey: "b", groupLabel: "Baskets", optionKey: "t", optionLabel: "Twin", price: "95.00", url: null },
    { groupKey: "b", groupLabel: "Baskets", optionKey: "s", optionLabel: "Single", price: "40.00", url: null },
  ]);
  assert.deepEqual(lines, ["Gas Type: LPG", "Baskets: Twin, Single"]);
  assert.ok(lines.every((l) => !l.includes("$")));
});
