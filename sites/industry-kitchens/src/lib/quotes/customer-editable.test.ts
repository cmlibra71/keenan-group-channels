import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isCustomerEditableStatus, quoteAllowsItemEdits } from "./customer-editable";

/**
 * What this guards: the account quote page had no edit at all (Tim, 11 Aug, card
 * FPfvaYLp), and the emailed quote let a customer edit ONCE — the flip to
 * `open_change_request` locked them out of changing a quantity back
 * (card 5bZsm1MF). Both surfaces now read this predicate, so a status list
 * fixed on one of them cannot go missing on the other.
 */
describe("isCustomerEditableStatus", () => {
  test("an unpriced request is editable — the customer is still building it", () => {
    assert.equal(isCustomerEditableStatus("quote_pending"), true);
  });

  test("a priced quote is editable — that is what raises a change request", () => {
    assert.equal(isCustomerEditableStatus("quote_available"), true);
  });

  test("an OPEN change request stays editable, so a quantity can be put back", () => {
    assert.equal(isCustomerEditableStatus("open_change_request"), true);
  });

  test("a settled quote is not editable", () => {
    for (const status of [
      "quote_accepted",
      "converted_to_order",
      "quote_expired",
      "quote_cancelled",
      "quote_on_hold",
    ]) {
      assert.equal(isCustomerEditableStatus(status), false, status);
    }
  });

  test("a staff-only draft is never editable", () => {
    assert.equal(isCustomerEditableStatus("draft"), false);
  });

  test("an unknown or missing status is not editable", () => {
    assert.equal(isCustomerEditableStatus(null), false);
    assert.equal(isCustomerEditableStatus(undefined), false);
    assert.equal(isCustomerEditableStatus("something_new"), false);
  });
});

describe("quoteAllowsItemEdits", () => {
  test("only an explicit true permits edits", () => {
    assert.equal(quoteAllowsItemEdits({ allow_edit_items: true }), true);
    assert.equal(quoteAllowsItemEdits({ allow_edit_items: false }), false);
    assert.equal(quoteAllowsItemEdits({}), false);
    assert.equal(quoteAllowsItemEdits(null), false);
    assert.equal(quoteAllowsItemEdits(undefined), false);
  });

  test("a truthy-but-not-true value does not open the quote up", () => {
    assert.equal(quoteAllowsItemEdits({ allow_edit_items: "yes" }), false);
    assert.equal(quoteAllowsItemEdits({ allow_edit_items: 1 }), false);
  });
});
