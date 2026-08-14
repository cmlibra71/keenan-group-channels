import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  resolveQuotePayState,
  everyLinePriced,
  isPayQuoteExpired,
  PAY_REASON_UNPRICED_LINES,
  PAY_REASON_PRICING_PENDING,
  PAY_REASON_NOT_READY,
  PAY_REASON_NO_TOTAL,
  PAY_REASON_NO_METHODS,
  PAY_REASON_NO_METHODS_FOR_ACCOUNT,
  PAY_REASON_NO_ADDRESS,
} from "./quote-payable";
import { PAY_UNAVAILABLE_ACCOUNT_QUOTE } from "../checkout/payment-availability.ts";

const NOW = Date.parse("2026-08-12T00:00:00Z");
const PAST = "2026-07-01T00:00:00Z";
const FUTURE = "2026-09-01T00:00:00Z";

const PAYABLE = {
  status: "quote_available",
  hidesPrices: false,
  expiresAt: FUTURE,
  items: [{ list_price: "61.00", sale_price: null }],
  amountDue: 67.1,
  paymentMethodCount: 1,
  hasDeliveryAddress: true,
};

describe("everyLinePriced", () => {
  test("$0.00 IS a price", () => {
    assert.equal(everyLinePriced([{ list_price: "0.00", sale_price: null }]), true);
    assert.equal(everyLinePriced([{ list_price: "10.00", sale_price: "0" }]), true);
  });

  test("a missing or unparsable price is unpriced", () => {
    assert.equal(everyLinePriced([{ list_price: null, sale_price: null }]), false);
    assert.equal(everyLinePriced([{ list_price: "", sale_price: null }]), false);
    assert.equal(everyLinePriced([{ list_price: "TBC", sale_price: null }]), false);
  });

  test("ONE unpriced line among many is enough", () => {
    assert.equal(
      everyLinePriced([{ list_price: "10.00" }, { list_price: null }, { list_price: "5.00" }]),
      false
    );
  });

  test("an empty quote is not payable", () => {
    assert.equal(everyLinePriced([]), false);
    assert.equal(everyLinePriced(null), false);
  });
});

describe("resolveQuotePayState", () => {
  test("a sent, priced, in-date quote is payable", () => {
    assert.deepEqual(resolveQuotePayState(PAYABLE, NOW), { kind: "enabled" });
  });

  test("an accepted quote is still payable — the pro-forma exists to be paid", () => {
    assert.deepEqual(
      resolveQuotePayState({ ...PAYABLE, status: "quote_accepted" }, NOW),
      { kind: "enabled" }
    );
  });

  test("an unpriced line greys Pay with the reason, it does not hide it", () => {
    const s = resolveQuotePayState(
      { ...PAYABLE, items: [{ list_price: "10.00" }, { list_price: null }] },
      NOW
    );
    assert.deepEqual(s, { kind: "disabled", reason: PAY_REASON_UNPRICED_LINES });
  });

  test("prices still being prepared greys Pay", () => {
    assert.deepEqual(resolveQuotePayState({ ...PAYABLE, hidesPrices: true }, NOW), {
      kind: "disabled",
      reason: PAY_REASON_PRICING_PENDING,
    });
  });

  test("a quote not yet sent greys Pay", () => {
    assert.deepEqual(
      resolveQuotePayState({ ...PAYABLE, status: "quote_on_hold" }, NOW),
      { kind: "disabled", reason: PAY_REASON_NOT_READY }
    );
  });

  test("a change request greys Pay — there is nothing settled to pay for", () => {
    assert.equal(
      resolveQuotePayState({ ...PAYABLE, status: "open_change_request" }, NOW).kind,
      "disabled"
    );
  });

  test("nothing to pay greys Pay", () => {
    assert.deepEqual(resolveQuotePayState({ ...PAYABLE, amountDue: 0 }, NOW), {
      kind: "disabled",
      reason: PAY_REASON_NO_TOTAL,
    });
  });

  test("a store with no payment methods switched on greys Pay", () => {
    assert.deepEqual(resolveQuotePayState({ ...PAYABLE, paymentMethodCount: 0 }, NOW), {
      kind: "disabled",
      reason: PAY_REASON_NO_METHODS,
    });
  });

  test("an account that may use none of the store's methods gets the ACCOUNT reason", () => {
    // Chefs Depot has one enabled method; marking it Staff only on an account
    // empties this customer's list while the store still takes payments. Telling
    // them "this store doesn't take online payments" would be untrue, and would
    // contradict what the checkout says about the same account.
    assert.deepEqual(
      resolveQuotePayState(
        { ...PAYABLE, paymentMethodCount: 0, channelPaymentMethodCount: 1 },
        NOW
      ),
      { kind: "disabled", reason: PAY_REASON_NO_METHODS_FOR_ACCOUNT }
    );
    assert.equal(PAY_REASON_NO_METHODS_FOR_ACCOUNT, PAY_UNAVAILABLE_ACCOUNT_QUOTE);
  });

  test("no delivery address greys Pay", () => {
    assert.deepEqual(resolveQuotePayState({ ...PAYABLE, hasDeliveryAddress: false }, NOW), {
      kind: "disabled",
      reason: PAY_REASON_NO_ADDRESS,
    });
  });

  test("a quote already converted to an order shows no Pay control", () => {
    assert.deepEqual(
      resolveQuotePayState({ ...PAYABLE, status: "converted_to_order" }, NOW),
      { kind: "hidden" }
    );
  });

  test("cancelled and expired quotes show no Pay control", () => {
    assert.deepEqual(resolveQuotePayState({ ...PAYABLE, status: "quote_cancelled" }, NOW), {
      kind: "hidden",
    });
    assert.deepEqual(resolveQuotePayState({ ...PAYABLE, expiresAt: PAST }, NOW), {
      kind: "hidden",
    });
  });

  test("a quote with no expiry date never expires", () => {
    assert.equal(isPayQuoteExpired(null, NOW), false);
    assert.equal(isPayQuoteExpired("not a date", NOW), false);
    assert.equal(isPayQuoteExpired(PAST, NOW), true);
  });

  test("the reason a customer can act on wins over one they cannot", () => {
    // No payment methods AND unpriced lines: tell them to call us, not to wait.
    const s = resolveQuotePayState(
      { ...PAYABLE, paymentMethodCount: 0, amountDue: 67.1 },
      NOW
    );
    assert.deepEqual(s, { kind: "disabled", reason: PAY_REASON_NO_METHODS });
  });
});
