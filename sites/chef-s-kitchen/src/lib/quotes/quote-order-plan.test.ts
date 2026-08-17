import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { planOrderFromPaidQuote, type PlannableQuote } from "./quote-order-plan";

const baseQuote = (over: Partial<PlannableQuote> = {}): PlannableQuote => ({
  channel_id: 2,
  account_id: null,
  contact_id: 77,
  currency_code: "AUD",
  base_amount: "100.0000",
  quote_amount: "100.0000",
  discount_amount: "0",
  coupon_discount: "0",
  gift_certificate_amount: "0",
  store_credit_amount: "0",
  shipping_cost: "0.0000",
  tax_inclusive: false,
  external_source: null,
  billing_address: { first_name: "Jo", last_name: "Blogs", email: "jo@example.com" },
  items: [
    {
      id: 1,
      product_id: 10,
      variant_id: null,
      product_name: "Bench",
      product_sku: "BENCH-1",
      quantity: 2,
      list_price: "50.0000",
      sale_price: null,
      extended_list_price: "100.0000",
      extended_sale_price: null,
    },
  ],
  ...over,
});

const CTX = { gstRate: 0.1 };

describe("planOrderFromPaidQuote — GST", () => {
  test("an ex-GST quote books ex/GST/inc on the order, never ex === inc", () => {
    const plan = planOrderFromPaidQuote(baseQuote(), CTX);
    assert.equal(plan.order.total_ex_tax, "100.0000");
    assert.equal(plan.order.total_tax, "10.0000");
    assert.equal(plan.order.total_inc_tax, "110.0000");
    assert.notEqual(plan.order.total_ex_tax, plan.order.total_inc_tax);
  });

  test("the order's total is the SAME inc-GST figure the customer read on the quote", () => {
    // $61 ex-GST reads $67.10 on the quote page; the order must charge $67.10.
    const plan = planOrderFromPaidQuote(
      baseQuote({ base_amount: "61.0000", quote_amount: "61.0000" }),
      CTX
    );
    assert.equal(plan.order.total_inc_tax, "67.1000");
  });

  test("a tax-inclusive quote extracts GST rather than adding it again", () => {
    const plan = planOrderFromPaidQuote(
      baseQuote({ tax_inclusive: true, base_amount: "110.0000", quote_amount: "110.0000" }),
      CTX
    );
    assert.equal(plan.order.total_inc_tax, "110.0000");
    assert.equal(plan.order.total_ex_tax, "100.0000");
  });

  test("a Zoey grand total is not GST'd twice", () => {
    const plan = planOrderFromPaidQuote(
      baseQuote({ quote_amount: "110.0000", external_source: "zoey" }),
      CTX
    );
    assert.equal(plan.order.total_inc_tax, "110.0000");
    assert.equal(plan.order.total_ex_tax, "100.0000");
  });

  test("a store credit bills what the customer's quote asked for, at the order's rate", () => {
    // Card vkYOSmJj. A credit is money already paid: the quote page and the Pay
    // button both read `payableInc`, so the order books exactly that. It is split
    // at the order's own GST rate, the same way an amended order treats a credit.
    const plan = planOrderFromPaidQuote(
      baseQuote({
        base_amount: "82187.0000",
        quote_amount: "72387.0000",
        shipping_cost: "200.0000",
        store_credit_amount: "10000.0000",
      }),
      CTX
    );
    assert.equal(plan.order.total_inc_tax, "80625.7000");
    assert.equal(plan.order.total_ex_tax, "73296.0909");
    assert.equal(plan.order.total_tax, "7329.6091");
    // The order's own figures reconcile at 10%, and the credit is still recorded.
    assert.equal(
      (Number(plan.order.total_ex_tax) + Number(plan.order.total_tax)).toFixed(4),
      plan.order.total_inc_tax
    );
    assert.equal(plan.order.store_credit_amount, "10000.0000");
  });

  test("a quote with no store credit books the plain inclusive total", () => {
    const plan = planOrderFromPaidQuote(baseQuote(), CTX);
    assert.equal(plan.order.total_inc_tax, "110.0000");
    assert.equal(plan.order.store_credit_amount, "0");
  });

  test("a GST-free tax class charges no GST", () => {
    const plan = planOrderFromPaidQuote(baseQuote(), { gstRate: 0 });
    assert.equal(plan.order.total_tax, "0.0000");
    assert.equal(plan.order.total_inc_tax, plan.order.total_ex_tax);
  });
});

describe("planOrderFromPaidQuote — freight", () => {
  test("no freight on the quote flags freightPending for the orders-team alert", () => {
    assert.equal(planOrderFromPaidQuote(baseQuote(), CTX).freightPending, true);
  });

  test("an applied freight charge is booked and stops the alert", () => {
    const plan = planOrderFromPaidQuote(
      baseQuote({ shipping_cost: "30.0000", quote_amount: "130.0000", shipping_method: "Road" }),
      CTX
    );
    assert.equal(plan.freightPending, false);
    assert.equal(plan.order.shipping_cost_ex_tax, "30.0000");
    assert.equal(plan.order.shipping_cost_inc_tax, "33.0000");
    assert.equal(plan.order.total_inc_tax, "143.0000");
  });

  test("freight hidden inside a Zoey grand total is booked as shipping, not lost", () => {
    // $100 lines + $30 freight, Zoey grand total 143.00 inc GST.
    const plan = planOrderFromPaidQuote(
      baseQuote({ quote_amount: "143.0000", external_source: "zoey" }),
      CTX
    );
    assert.equal(plan.order.shipping_cost_ex_tax, "30.0000");
    assert.equal(plan.freightPending, false);
  });
});

describe("planOrderFromPaidQuote — lines", () => {
  test("each line carries its own ex/GST/inc split and its source id", () => {
    const [line] = planOrderFromPaidQuote(baseQuote(), CTX).items;
    assert.equal(line.source_item_id, 1);
    assert.equal(line.payload.price_ex_tax, "50.0000");
    assert.equal(line.payload.price_inc_tax, "55.0000");
    assert.equal(line.payload.total_ex_tax, "100.0000");
    assert.equal(line.payload.total_inc_tax, "110.0000");
    assert.equal(line.payload.sku, "BENCH-1");
    assert.equal(line.payload.quantity, 2);
  });

  test("a sale price on the line is what is charged", () => {
    const plan = planOrderFromPaidQuote(
      baseQuote({
        items: [
          {
            id: 4,
            product_id: 10,
            variant_id: null,
            product_name: "Bench",
            quantity: 1,
            list_price: "50.0000",
            sale_price: "40.0000",
            extended_list_price: "50.0000",
            extended_sale_price: "40.0000",
          },
        ],
      }),
      CTX
    );
    assert.equal(plan.items[0].payload.price_ex_tax, "40.0000");
    assert.equal(plan.items[0].payload.base_price, "50.0000");
  });
});

describe("planOrderFromPaidQuote — addresses", () => {
  const SAVED = {
    firstName: "Jo",
    lastName: "Blogs",
    company: null,
    address1: "9 Saved St",
    address2: null,
    city: "Melbourne",
    stateOrProvince: "VIC",
    postalCode: "3000",
    country: "AU",
    countryCode: "AU",
    email: "jo@example.com",
    phone: null,
  };

  test("the quote's OWN ship-to always wins — a customer may not change it", () => {
    const plan = planOrderFromPaidQuote(
      baseQuote({
        shipping_address: {
          first_name: "Jo",
          street1: "1 Quote Rd",
          city: "Geelong",
          region: "VIC",
          postcode: "3220",
          country: "AU",
        },
      }),
      { ...CTX, fallbackShipTo: SAVED }
    );
    assert.equal(plan.shipTo!.address1, "1 Quote Rd");
    assert.equal(plan.shipTo!.postalCode, "3220");
  });

  test("a quote with no ship-to takes the customer's saved address", () => {
    const plan = planOrderFromPaidQuote(baseQuote(), { ...CTX, fallbackShipTo: SAVED });
    assert.equal(plan.shipTo!.address1, "9 Saved St");
  });

  test("an empty shipping_address bag counts as none", () => {
    const plan = planOrderFromPaidQuote(
      baseQuote({ shipping_address: { street1: "", city: "" } }),
      { ...CTX, fallbackShipTo: SAVED }
    );
    assert.equal(plan.shipTo!.address1, "9 Saved St");
  });

  test("no ship-to anywhere leaves the order without one rather than inventing it", () => {
    assert.equal(planOrderFromPaidQuote(baseQuote(), CTX).shipTo, null);
  });

  test("the quote's billing address is used, falling back only when absent", () => {
    assert.deepEqual(planOrderFromPaidQuote(baseQuote(), CTX).order.billing_address, {
      first_name: "Jo",
      last_name: "Blogs",
      email: "jo@example.com",
    });
    const plan = planOrderFromPaidQuote(baseQuote({ billing_address: null }), {
      ...CTX,
      fallbackBilling: { first_name: "Fallback", email: "f@example.com" },
    });
    assert.equal((plan.order.billing_address as Record<string, unknown>).first_name, "Fallback");
  });
});

describe("planOrderFromPaidQuote — carry-over", () => {
  test("only copy-to-order attributes carry, and only scalars", () => {
    const plan = planOrderFromPaidQuote(
      baseQuote({
        attributes: {
          po_number: "PO-1234",
          test_mode: true,
          submitted_at: "2026-08-01",
          spec_sheets: [{ name: "a.pdf", url: "https://x/a.pdf" }],
        },
      }),
      { ...CTX, copyAttributeCodes: new Set(["po_number", "spec_sheets"]) }
    );
    assert.deepEqual(plan.order.metafields, { po_number: "PO-1234" });
  });

  test("line notes and internal notes reach the order's memo", () => {
    const plan = planOrderFromPaidQuote(
      baseQuote({
        internal_notes: "Ring before delivery",
        items: [
          {
            id: 1,
            product_id: 10,
            product_sku: "BENCH-1",
            quantity: 1,
            list_price: "50",
            extended_list_price: "50",
            customer_notes: "Left-hand drainer",
          },
        ],
      }),
      CTX
    );
    assert.match(plan.order.internal_memo!, /Ring before delivery/);
    assert.match(plan.order.internal_memo!, /BENCH-1: Left-hand drainer/);
  });

  test("the customer's own quote note becomes the order's customer message", () => {
    const plan = planOrderFromPaidQuote(baseQuote({ customer_notes: "Deliver Fri" }), CTX);
    assert.equal(plan.order.customer_message, "Deliver Fri");
  });
});
