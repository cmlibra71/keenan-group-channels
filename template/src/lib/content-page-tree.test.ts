import test from "node:test";
import assert from "node:assert/strict";
import { chooseContentPageTree } from "./content-page-tree";

const base = { policyLayoutEnabled: false, draft: false };

test("a published policy page's own design reaches shoppers without the flag", () => {
  assert.deepEqual(
    chooseContentPageTree({ ...base, pageKind: "policy", hasOwnTree: true }),
    { source: "page", kind: "policy" }
  );
});

test("an ordinary content page's own design is unchanged", () => {
  assert.deepEqual(
    chooseContentPageTree({ ...base, pageKind: "custom", hasOwnTree: true }),
    { source: "page", kind: "custom" }
  );
});

test("the SHARED policy layout still waits for the flag", () => {
  // Nothing authored on the page itself: today's live Chefs Depot state.
  assert.deepEqual(
    chooseContentPageTree({ ...base, pageKind: "policy", hasOwnTree: false }),
    { source: "blocks", kind: "custom" }
  );
  assert.deepEqual(
    chooseContentPageTree({
      pageKind: "policy",
      hasOwnTree: false,
      policyLayoutEnabled: true,
      draft: false,
    }),
    { source: "policy_layout", kind: "policy" }
  );
});

test("preview shows the shared layout even with the flag off", () => {
  assert.deepEqual(
    chooseContentPageTree({
      pageKind: "policy",
      hasOwnTree: false,
      policyLayoutEnabled: false,
      draft: true,
    }),
    { source: "policy_layout", kind: "policy" }
  );
});

test("a page with nothing authored falls through to its published blocks", () => {
  assert.deepEqual(
    chooseContentPageTree({ ...base, pageKind: "custom", hasOwnTree: false }),
    { source: "blocks", kind: "custom" }
  );
  // …and preview does not invent a design for a non-policy page.
  assert.deepEqual(
    chooseContentPageTree({ pageKind: "custom", hasOwnTree: false, policyLayoutEnabled: false, draft: true }),
    { source: "blocks", kind: "custom" }
  );
});
