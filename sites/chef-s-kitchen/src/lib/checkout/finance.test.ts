import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterFinanceMethods,
  financeApplicationValues,
  financeLinesFromCart,
  financeOfferForCart,
  fundingTypeError,
  newUploadToken,
  weeklyAmountForMethod,
  weeklyBadgeForMethod,
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
  assert.equal(offer.silverchefWeekly, 0);
  assert.equal(offer.skopeWeekly, null);
  assert.equal(weeklyBadgeForMethod("silverchef", offer), null);
  assert.equal(weeklyBadgeForMethod("finance", offer), null);
});

test("at $1,000 inc GST the offer appears with the whole-order weekly rent", () => {
  const offer = financeOfferForCart({ lines: [{ amountIncGst: 1000 }], goodsTotalIncGst: 1000 });
  assert.equal(offer.eligible, true);
  assert.equal(offer.silverchefWeekly, 12.69);
  assert.equal(weeklyAmountForMethod("silverchef", offer), 12.69);
});

// ── The two offers are labelled separately, and never blended ───────────────
// The live IK site quotes "Rent per Week: $X" (SilverChef) and "Own Me $X a
// week" (SKOPE). Blending the two rates into one figure under the SilverChef
// label quotes a rent SilverChef does not offer.

test("SilverChef quotes the whole basket at its own rate, SKOPE lines included", () => {
  const offer = financeOfferForCart({
    lines: [
      { amountIncGst: 4000, sku: "SKO-1" },
      { amountIncGst: 4377, sku: "PLAIN" },
    ],
    goodsTotalIncGst: 8377,
  });
  assert.equal(offer.skopeOnly, false);
  assert.equal(offer.skopeWeekly, null);
  assert.deepEqual(weeklyBadgeForMethod("silverchef", offer), {
    text: "Rent per Week: $106.32",
    note: null,
  });
  // A mixed basket has no SKOPE offer at all — and is not offered SKOPE funding.
  assert.equal(weeklyBadgeForMethod("finance", offer), null);
  assert.equal(offer.fundingTypesByMethod.finance.includes("Skope Funding (Skope Brands only)"), false);
});

test("an all-SKOPE basket gets the SKOPE offer, under the SKOPE label", () => {
  const offer = financeOfferForCart({
    lines: [
      { amountIncGst: 4000, sku: "SKO-1" },
      { amountIncGst: 4377, sku: "SKO-2" },
    ],
    goodsTotalIncGst: 8377,
  });
  assert.equal(offer.skopeOnly, true);
  assert.equal(offer.skopeWeekly, 70.08);
  const badge = weeklyBadgeForMethod("finance", offer);
  assert.equal(badge?.text, "Own Me $70.08 a week");
  assert.ok(badge?.note?.includes("Skope Funding"));
  assert.equal(offer.fundingTypesByMethod.finance.includes("Skope Funding (Skope Brands only)"), true);
  // SilverChef still quotes its own rate on the same basket, and they differ.
  assert.equal(weeklyBadgeForMethod("silverchef", offer)?.text, "Rent per Week: $106.32");
});

test("money on a button is separated and 2dp, never a bare toFixed", () => {
  const offer = financeOfferForCart({ lines: [{ amountIncGst: 100000 }], goodsTotalIncGst: 100000 });
  assert.equal(weeklyBadgeForMethod("silverchef", offer)?.text, "Rent per Week: $1,269.23");
});

test("no other method ever carries a weekly figure", () => {
  const offer = financeOfferForCart({ lines: [{ amountIncGst: 8377 }], goodsTotalIncGst: 8377 });
  assert.equal(weeklyBadgeForMethod("bank_transfer", offer), null);
  assert.equal(weeklyAmountForMethod("bank_transfer", offer), null);
});

test("the two buttons carry different funding types", () => {
  const offer = financeOfferForCart({ lines: [{ amountIncGst: 2000 }], goodsTotalIncGst: 2000 });
  assert.ok(offer.fundingTypesByMethod.silverchef.every((t) => !t.startsWith("Traditional")));
  assert.ok(offer.fundingTypesByMethod.finance.includes("Traditional Finance option"));
});

test("an upload token is always the shape the upload route accepts", () => {
  // The route refuses anything but /^[0-9a-f-]{36}$/i, so a fallback that isn't
  // that shape kills every photo upload with "Invalid upload session."
  const TOKEN_RE = /^[0-9a-f-]{36}$/i;
  assert.ok(TOKEN_RE.test(newUploadToken()));
  const realCrypto = globalThis.crypto;
  try {
    // The no-secure-context case: randomUUID simply isn't there.
    Object.defineProperty(globalThis, "crypto", { value: {}, configurable: true });
    const tokens = new Set(Array.from({ length: 200 }, () => newUploadToken()));
    for (const t of tokens) assert.ok(TOKEN_RE.test(t), `bad token: ${t}`);
    assert.equal(tokens.size, 200, "tokens collide");
  } finally {
    Object.defineProperty(globalThis, "crypto", { value: realCrypto, configurable: true });
  }
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

test("a funding type from the other button, or the wrong basket, is refused", () => {
  const mixed = financeOfferForCart({
    lines: [
      { amountIncGst: 4000, sku: "SKO-1" },
      { amountIncGst: 4377, sku: "PLAIN" },
    ],
    goodsTotalIncGst: 8377,
  });
  assert.equal(fundingTypeError("silverchef", "SilverChef - I do have an account", mixed), null);
  assert.ok(fundingTypeError("silverchef", "Traditional Finance option", mixed));
  assert.ok(fundingTypeError("finance", "Fleet Management", mixed));
  assert.ok(fundingTypeError("finance", undefined, mixed));
  // "Skope Brands only" on a basket that is not all SKOPE — refused server-side,
  // not merely absent from the dropdown.
  assert.ok(fundingTypeError("finance", "Skope Funding (Skope Brands only)", mixed));

  const skopeOnly = financeOfferForCart({
    lines: [{ amountIncGst: 8377, sku: "SKO-1" }],
    goodsTotalIncGst: 8377,
  });
  assert.equal(fundingTypeError("finance", "Skope Funding (Skope Brands only)", skopeOnly), null);

  // Not a finance method at all — nothing to check.
  assert.equal(fundingTypeError("bank_transfer", undefined, null), null);
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
