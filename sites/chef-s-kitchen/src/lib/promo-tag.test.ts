import { test } from "node:test";
import assert from "node:assert/strict";

import { PROMO_TAG_LABEL } from "./promo-tag";

test("Chefs Depot prints the wording the mock rendered, not the description's", () => {
  // Card FNYihLHk: the description says "Buy more + Save more", the approved mock says
  // "Buy more & save". Rendered copy wins; this locks it so the two cannot drift back.
  assert.equal(PROMO_TAG_LABEL, "Buy more & save");
});

test("the tag states no threshold, percentage or dollar figure", () => {
  // Cards Nyp8bkPm / gk23c1VK own the spend-more-save-more model. A number here would be a
  // money claim this card never had the authority to make.
  assert.ok(PROMO_TAG_LABEL);
  assert.ok(!/[0-9]/.test(PROMO_TAG_LABEL), "no figures in the tag");
  assert.ok(!/[$%]/.test(PROMO_TAG_LABEL), "no money or percentage symbols in the tag");
});

test("the tag says nothing about stock", () => {
  // The storefront carries no stock wording on a tile (card CXnP1lrL, sf-catalog-browse).
  assert.ok(PROMO_TAG_LABEL);
  assert.ok(!/stock|available|backorder/i.test(PROMO_TAG_LABEL));
});
