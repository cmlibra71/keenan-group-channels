import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterFinanceMethods,
  financeApplicationValues,
  financeLinesFromCart,
  financeOfferForCart,
  fundingTypeError,
  weeklyAmountForMethod,
} from "./finance.ts";

const cartLine = (over: Partial<Parameters<typeof financeLinesFromCart>[0][number]> = {}) => ({
  quantity: 1,
  list_price: "1000",
  sale_price: null,
  product_sku: "RC-1",
  ...over,
});

test("cart lines are measured GST-inclusive, at the price actually charged", () => {
  const lines = financeLinesFromCart([cartLine({ list_price: "1000", sale_price: "900", quantity: 2 })], false);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].amountIncGst, 1980); // 900 x 2 + GST
  assert.equal(lines[0].sku, "RC-1");
});

test("a GST-inclusive channel is not taxed twice", () => {
  const lines = financeLinesFromCart([cartLine({ list_price: "1100" })], true);
  assert.equal(lines[0].amountIncGst, 1100);
});

test("the variant SKU wins, because that is what identifies a SKOPE line", () => {
  const lines = financeLinesFromCart(
    [cartLine({ product_sku: "RC-1", variant_sku: "SKO-99" } as never)],
    false
  );
  assert.equal(lines[0].sku, "SKO-99");
});

test("under $1,000 inc GST there is no offer and no weekly figure", () => {
  const offer = financeOfferForCart({ lines: [{ amountIncGst: 999.99 }], goodsTotalIncGst: 999.99 });
  assert.equal(offer.eligible, false);
  assert.equal(offer.weeklyAmount, 0);
  assert.equal(weeklyAmountForMethod("silverchef", offer), null);
});

test("at $1,000 inc GST the offer appears with the whole-order weekly rent", () => {
  const offer = financeOfferForCart({ lines: [{ amountIncGst: 1000 }], goodsTotalIncGst: 1000 });
  assert.equal(offer.eligible, true);
  assert.equal(offer.weeklyAmount, 12.69);
  assert.equal(weeklyAmountForMethod("silverchef", offer), 12.69);
});

test("the weekly figure rides the SilverChef button only", () => {
  const offer = financeOfferForCart({ lines: [{ amountIncGst: 8377 }], goodsTotalIncGst: 8377 });
  assert.equal(weeklyAmountForMethod("silverchef", offer), 106.32);
  assert.equal(weeklyAmountForMethod("finance", offer), null);
  assert.equal(weeklyAmountForMethod("bank_transfer", offer), null);
});

test("the two buttons carry different funding types", () => {
  const offer = financeOfferForCart({ lines: [{ amountIncGst: 2000 }], goodsTotalIncGst: 2000 });
  assert.ok(offer.fundingTypesByMethod.silverchef.every((t) => !t.startsWith("Traditional")));
  assert.ok(offer.fundingTypesByMethod.finance.includes("Traditional Finance option"));
});

test("finance methods are hidden below the floor and shown above it", () => {
  const methods = [{ id: "bank_transfer" }, { id: "silverchef" }, { id: "finance" }];
  assert.deepEqual(
    filterFinanceMethods(methods, false).map((m) => m.id),
    ["bank_transfer"]
  );
  assert.deepEqual(
    filterFinanceMethods(methods, true).map((m) => m.id),
    ["bank_transfer", "silverchef", "finance"]
  );
});

test("a funding type from the other button is refused", () => {
  assert.equal(fundingTypeError("silverchef", "SilverChef - I do have an account"), null);
  assert.ok(fundingTypeError("silverchef", "Traditional Finance option"));
  assert.ok(fundingTypeError("finance", "Fleet Management"));
  assert.ok(fundingTypeError("finance", undefined));
  // Not a finance method at all — nothing to check.
  assert.equal(fundingTypeError("bank_transfer", undefined), null);
});

test("the application is read from the finance_-prefixed inputs only", () => {
  const posted: Record<string, string> = {
    finance_first_name: "  Tim  ",
    finance_business_name: "Test Kitchen",
    finance_order_number: "should be ignored",
    firstName: "the order's own field",
  };
  const values = financeApplicationValues((name) => posted[name] ?? null);
  assert.equal(values.first_name, "Tim");
  assert.equal(values.business_name, "Test Kitchen");
  assert.equal("order_number" in values, false);
  assert.equal(Object.values(values).includes("the order's own field"), false);
});
