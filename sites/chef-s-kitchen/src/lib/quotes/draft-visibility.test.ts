import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  DRAFT_QUOTE_STATUS,
  isStaffOnlyDraft,
  withoutStaffOnlyDrafts,
} from "./draft-visibility";

/**
 * The leak this guards: the portal's "Duplicate to Draft" copies a quote or an
 * order into a `draft` quote that keeps the customer's own contact_id, so the
 * customer's account pages would list and open an internal working copy carrying
 * negotiated prices. Every assertion below is about a draft not reaching them.
 */
describe("isStaffOnlyDraft", () => {
  test("a draft is staff-only", () => {
    assert.equal(isStaffOnlyDraft({ status: DRAFT_QUOTE_STATUS }), true);
    assert.equal(isStaffOnlyDraft({ status: "draft" }), true);
  });

  test("every customer-facing status stays visible", () => {
    for (const status of [
      "created",
      "quote_pending",
      "quote_available",
      "open_change_request",
      "quote_accepted",
      "quote_on_hold",
      "converted_to_order",
      "quote_expired",
      "quote_cancelled",
    ]) {
      assert.equal(isStaffOnlyDraft({ status }), false, status);
    }
  });

  test("a missing or null status is not a draft (it must not hide real quotes)", () => {
    assert.equal(isStaffOnlyDraft({ status: null }), false);
    assert.equal(isStaffOnlyDraft({}), false);
    assert.equal(isStaffOnlyDraft(null), false);
    assert.equal(isStaffOnlyDraft(undefined), false);
  });

  test("the status is matched exactly — no prefix or case fuzz", () => {
    assert.equal(isStaffOnlyDraft({ status: "Draft" }), false);
    assert.equal(isStaffOnlyDraft({ status: "draft_sent" }), false);
  });
});

describe("withoutStaffOnlyDrafts", () => {
  test("drops the drafts and keeps everything else, in order", () => {
    const rows = [
      { id: 1, status: "quote_available" },
      { id: 2, status: "draft" },
      { id: 3, status: "quote_pending" },
      { id: 4, status: "draft" },
      { id: 5, status: "converted_to_order" },
    ];
    assert.deepEqual(
      withoutStaffOnlyDrafts(rows).map((q) => q.id),
      [1, 3, 5]
    );
  });

  test("an all-draft list comes back empty rather than partially filtered", () => {
    assert.deepEqual(withoutStaffOnlyDrafts([{ status: "draft" }, { status: "draft" }]), []);
  });

  test("leaves a list with no drafts untouched", () => {
    const rows = [{ status: "quote_available" }, { status: "quote_accepted" }];
    assert.deepEqual(withoutStaffOnlyDrafts(rows), rows);
  });
});
