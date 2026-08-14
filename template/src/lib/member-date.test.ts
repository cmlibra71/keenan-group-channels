import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMemberSince } from "./member-date.ts";

/**
 * The two timestamps below are real: they are when two of the live Chefs Depot
 * members subscribed. Both are UTC evenings, so in Melbourne both fall on the NEXT
 * day — the case that made the account page tell them they joined a day early.
 */
test("a UTC evening reads as the Melbourne day the customer remembers", () => {
  assert.equal(formatMemberSince("2026-07-25T14:14:45.293Z"), "26 July 2026");
  assert.equal(formatMemberSince("2026-07-30T19:24:03.558Z"), "31 July 2026");
});

test("a daytime UTC timestamp is unaffected", () => {
  assert.equal(formatMemberSince("2026-07-20T07:35:47.581Z"), "20 July 2026");
});

test("daylight saving is handled by naming the zone, not by an offset", () => {
  // +11 in January: 13:00 UTC on the 1st is already the 2nd in Melbourne.
  assert.equal(formatMemberSince("2026-01-01T13:00:00.000Z"), "2 January 2026");
});

test("no date, or an unusable one, renders nothing rather than 'Invalid Date'", () => {
  assert.equal(formatMemberSince(null), null);
  assert.equal(formatMemberSince(undefined), null);
  assert.equal(formatMemberSince(""), null);
  assert.equal(formatMemberSince("not a date"), null);
});
