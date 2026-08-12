import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  FALLBACK_HIDE_PRICE_STATUSES,
  resolveQuoteTotal,
  quoteHidesPrices,
  redactQuotePrices,
  resolveQuoteAcceptState,
  isQuoteExpired,
  ACCEPT_REASON_PRICING_PENDING,
  ACCEPT_REASON_NOT_READY,
} from "./price-visibility";

const NOW = Date.parse("2026-08-05T00:00:00Z");
const PAST = "2026-07-01T00:00:00Z";
const FUTURE = "2026-09-01T00:00:00Z";

describe("quoteHidesPrices", () => {
  test("the hide_prices column wins over the status heuristic", () => {
    // A priced quote parked on a status that would otherwise hide prices.
    assert.equal(
      quoteHidesPrices({ status: "open_change_request", hide_prices: false }),
      false
    );
    // ...and the reverse: a hiding flag on a normally-visible status.
    assert.equal(quoteHidesPrices({ status: "quote_available", hide_prices: true }), true);
  });

  test("falls back to the status set only when hide_prices is null/undefined", () => {
    assert.equal(quoteHidesPrices({ status: "quote_pending", hide_prices: null }), true);
    assert.equal(quoteHidesPrices({ status: "created" }), true);
    assert.equal(quoteHidesPrices({ status: "open_change_request" }), true);
    assert.equal(quoteHidesPrices({ status: "quote_available", hide_prices: null }), false);
    assert.equal(quoteHidesPrices({ status: "quote_on_hold" }), false);
    assert.equal(quoteHidesPrices({ status: null }), false);
  });

  test("honours a caller-supplied status set (portal-configured statuses)", () => {
    const custom = new Set(["awaiting_costing"]);
    assert.equal(quoteHidesPrices({ status: "awaiting_costing" }, custom), true);
    // The default fallback statuses no longer apply once the table has been read.
    assert.equal(quoteHidesPrices({ status: "quote_pending" }, custom), false);
  });

  test("the fallback set matches the price-hiding system statuses", () => {
    // Every status seeded hidePrices=true in @keenan/services SYSTEM_QUOTE_STATUSES
    // — including `draft`, the staff-only one, which had been missing here.
    assert.deepEqual(
      [...FALLBACK_HIDE_PRICE_STATUSES].sort(),
      ["created", "draft", "open_change_request", "quote_pending"]
    );
  });

  test("$0 is a price, not a missing one — visibility never looks at amounts", () => {
    assert.equal(
      quoteHidesPrices({ status: "quote_available", hide_prices: false }),
      false
    );
  });
});

describe("redactQuotePrices", () => {
  const quote = {
    id: 1,
    status: "quote_pending",
    base_amount: "100.00",
    discount_amount: "5.00",
    shipping_cost: "10.00",
    quote_amount: "105.00",
    quote_number: "QU:00113",
    items: [
      {
        id: 9,
        product_name: "Blixer",
        quantity: 2,
        list_price: "50.00",
        sale_price: "45.00",
        extended_list_price: "100.00",
        extended_sale_price: "90.00",
        discount_amount: "5.00",
      },
    ],
  };

  test("nulls every price field on the quote and its items", () => {
    const out = redactQuotePrices(quote);
    assert.equal(out.base_amount, null);
    assert.equal(out.discount_amount, null);
    assert.equal(out.shipping_cost, null);
    assert.equal(out.quote_amount, null);
    const item = out.items[0];
    assert.equal(item.list_price, null);
    assert.equal(item.sale_price, null);
    assert.equal(item.extended_list_price, null);
    assert.equal(item.extended_sale_price, null);
    assert.equal(item.discount_amount, null);
  });

  test("keeps the non-price fields the page still has to render", () => {
    const out = redactQuotePrices(quote);
    assert.equal(out.quote_number, "QU:00113");
    assert.equal(out.items[0].product_name, "Blixer");
    assert.equal(out.items[0].quantity, 2);
  });

  test("does not mutate the input (service rows can end up cached)", () => {
    redactQuotePrices(quote);
    assert.equal(quote.quote_amount, "105.00");
    assert.equal(quote.items[0].sale_price, "45.00");
  });

  test("copes with a quote that carries no items array", () => {
    const out = redactQuotePrices({ id: 2, quote_amount: "1.00" });
    assert.equal(out.quote_amount, null);
  });
});

describe("isQuoteExpired", () => {
  test("no date, or an unparsable one, is not expired", () => {
    assert.equal(isQuoteExpired(null, NOW), false);
    assert.equal(isQuoteExpired(undefined, NOW), false);
    assert.equal(isQuoteExpired("not-a-date", NOW), false);
  });

  test("compares against the supplied instant", () => {
    assert.equal(isQuoteExpired(PAST, NOW), true);
    assert.equal(isQuoteExpired(FUTURE, NOW), false);
    assert.equal(isQuoteExpired(new Date(PAST), NOW), true);
  });
});

describe("resolveQuoteAcceptState", () => {
  test("enabled only for a priced, sent, in-date quote", () => {
    assert.deepEqual(
      resolveQuoteAcceptState(
        { status: "quote_available", hidesPrices: false, expires_at: FUTURE },
        NOW
      ),
      { kind: "enabled" }
    );
    assert.deepEqual(
      resolveQuoteAcceptState({ status: "quote_available", hidesPrices: false }, NOW),
      { kind: "enabled" }
    );
  });

  test("greyed with the pricing reason while pricing is being prepared", () => {
    for (const status of ["created", "quote_pending", "open_change_request"]) {
      assert.deepEqual(
        resolveQuoteAcceptState({ status, hidesPrices: true }, NOW),
        { kind: "disabled", reason: ACCEPT_REASON_PRICING_PENDING }
      );
    }
  });

  test("a change request is no longer acceptable", () => {
    const state = resolveQuoteAcceptState(
      { status: "open_change_request", hidesPrices: true },
      NOW
    );
    assert.notEqual(state.kind, "enabled");
  });

  test("neutral reason when the quote shows prices but still isn't acceptable", () => {
    assert.deepEqual(
      resolveQuoteAcceptState({ status: "quote_on_hold", hidesPrices: false }, NOW),
      { kind: "disabled", reason: ACCEPT_REASON_NOT_READY }
    );
  });

  test("hidden on terminal quotes", () => {
    for (const status of [
      "quote_accepted",
      "converted_to_order",
      "quote_cancelled",
      "quote_expired",
    ]) {
      assert.deepEqual(resolveQuoteAcceptState({ status, hidesPrices: false }, NOW), {
        kind: "hidden",
      });
    }
  });

  test("hidden once the valid-until date has passed, whatever the status says", () => {
    assert.deepEqual(
      resolveQuoteAcceptState(
        { status: "quote_available", hidesPrices: false, expires_at: PAST },
        NOW
      ),
      { kind: "hidden" }
    );
  });

  test("a missing status is not acceptable rather than a crash", () => {
    assert.deepEqual(resolveQuoteAcceptState({ status: null, hidesPrices: true }, NOW), {
      kind: "disabled",
      reason: ACCEPT_REASON_PRICING_PENDING,
    });
  });
});

describe("resolveQuoteTotal", () => {
  const priced = [{ list_price: "100.00" }];
  const zeroLines = [{ list_price: "0" }, { sale_price: "0.00" }];

  test("returns the total when there is one", () => {
    assert.equal(resolveQuoteTotal({ quote_amount: "1250.50", items: priced }), 1250.5);
  });

  test("falls back to base_amount only when quote_amount is absent", () => {
    assert.equal(resolveQuoteTotal({ quote_amount: null, base_amount: "99", items: priced }), 99);
  });

  test("shows $0.00 for a genuinely zero-value quote", () => {
    assert.equal(resolveQuoteTotal({ quote_amount: "0", items: zeroLines }), 0);
    assert.equal(resolveQuoteTotal({ quote_amount: "0", items: [] }), 0);
  });

  test("refuses a stale zero total when the lines carry money", () => {
    // 62 production quotes look like this — recalculateTotals only fires on item
    // mutation, so the header sits at 0 while the lines are priced. Printing
    // "$0.00" would tell the customer they owe nothing.
    assert.equal(resolveQuoteTotal({ quote_amount: "0", items: priced }), null);
    assert.equal(
      resolveQuoteTotal({ quote_amount: "0.00", items: [{ sale_price: "250" }] }),
      null
    );
  });

  test("returns null when there is no usable number at all", () => {
    assert.equal(resolveQuoteTotal({ quote_amount: null, base_amount: null, items: priced }), null);
    assert.equal(resolveQuoteTotal({ quote_amount: "not-a-number", items: priced }), null);
  });

  test("tolerates a missing items array", () => {
    assert.equal(resolveQuoteTotal({ quote_amount: "0" }), 0);
    assert.equal(resolveQuoteTotal({ quote_amount: "50" }), 50);
  });
});
