import { test } from "node:test";
import assert from "node:assert/strict";
import { detailsOpenFor } from "./responsive-details-state.ts";

test("detailsOpenFor picks the breakpoint's authored state", () => {
  assert.equal(detailsOpenFor("", "open", true, true), true);
  assert.equal(detailsOpenFor("", "open", false, true), false);
  assert.equal(detailsOpenFor("open", "", false, false), true);
  assert.equal(detailsOpenFor("open", "", true, true), false);
  assert.equal(detailsOpenFor(null, "open", false, true), true, "no base → unchanged");
  assert.equal(detailsOpenFor("open", null, true, false), false, "no lg → unchanged");
});

test("detailsOpenFor: data-open-xl wins from 1280px, else lg applies", () => {
  // open only from 1280 (Zoey's buying-guides first FAQ item)
  assert.equal(detailsOpenFor("", "", true, false, "open", true), true, "xl width → xl");
  assert.equal(detailsOpenFor("", "", true, true, "open", false), false, "lg width → lg");
  assert.equal(detailsOpenFor("", "", false, true, "open", false), false, "phone → base");
  assert.equal(detailsOpenFor("", "open", true, false, null, true), true, "no xl → lg at xl width");
  assert.equal(detailsOpenFor("", null, true, true, null, true), true, "no xl, no lg → unchanged");
});
