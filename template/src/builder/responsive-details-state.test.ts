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
