import test from "node:test";
import assert from "node:assert/strict";
import { noticeTextFrom } from "./sign-in-notice-text.ts";

test("noticeTextFrom: known key → its text; anything else → null", () => {
  const v = { fatjaks: { text: " Fat Jaks | Dashboard | Industry Kitchens is a restricted page. " } };
  assert.equal(noticeTextFrom(v, "fatjaks"), "Fat Jaks | Dashboard | Industry Kitchens is a restricted page.");
  assert.equal(noticeTextFrom(v, "nope"), null);
  assert.equal(noticeTextFrom(v, "__proto__"), null);
  assert.equal(noticeTextFrom(v, "Fat Jaks"), null);
  assert.equal(noticeTextFrom(null, "fatjaks"), null);
  assert.equal(noticeTextFrom({ fatjaks: { text: "" } }, "fatjaks"), null);
  assert.equal(noticeTextFrom(v, ["fatjaks"]), null);
});
