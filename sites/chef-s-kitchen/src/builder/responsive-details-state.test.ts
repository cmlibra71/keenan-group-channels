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

test("data-open-at: parse + pick the largest min ≤ width; junk ignored", async () => {
  const { parseOpenAt, openAtFor } = await import("./responsive-details-state.ts");
  const p = parseOpenAt(" 900:open , 0:closed, nope, 1280:x, 99999:open");
  assert.deepEqual(p, [{ min: 0, open: false }, { min: 900, open: true }, { min: 10000, open: true }]);
  assert.equal(openAtFor(p, 390, true), false);
  assert.equal(openAtFor(p, 899, true), false);
  assert.equal(openAtFor(p, 900, false), true);
  assert.equal(openAtFor(parseOpenAt("1280:open"), 1024, false), false, "below every min → unchanged");
  assert.deepEqual(parseOpenAt(""), []);
  assert.deepEqual(parseOpenAt(null), []);
});
