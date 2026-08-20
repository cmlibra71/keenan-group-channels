import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterFinanceMethods,
  financeApplicationValues,
  financeFloorError,
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

// ── The floor and the rates belong to the STOREFRONT (card 6GBlDtwf) ───────
// Unset keeps $1,000 / 5.5% / 3.625%, so nothing moves on either site until
// someone changes it. What is stored is customer-facing money, so an unusable
// value has to read as the default and never as zero.

test("a storefront's own floor decides the offer, not the shipped $1,000", () => {
  const settings = { minOrderIncGst: 2500, rates: { standard: 0.055, skope: 0.03625 } };
  const under = financeOfferForCart({
    lines: [{ amountIncGst: 2000 }],
    goodsTotalIncGst: 2000,
    settings,
  });
  assert.equal(under.eligible, false, "$2,000 cleared a $2,500 floor");
  assert.equal(weeklyBadgeForMethod("silverchef", under), null);

  const over = financeOfferForCart({
    lines: [{ amountIncGst: 2500 }],
    goodsTotalIncGst: 2500,
    settings,
  });
  assert.equal(over.eligible, true);
  assert.equal(over.minOrderIncGst, 2500);
});

test("the refusal quotes the floor the shopper was actually refused on", () => {
  const offer = financeOfferForCart({
    lines: [{ amountIncGst: 2000 }],
    goodsTotalIncGst: 2000,
    settings: { minOrderIncGst: 2500, rates: { standard: 0.055, skope: 0.03625 } },
  });
  assert.equal(
    financeFloorError(offer.minOrderIncGst),
    "Finance is available on orders of $2,500 or more (including GST). Please choose another way to pay."
  );
  // The default storefront still says exactly what it said before.
  const shipped = financeOfferForCart({ lines: [{ amountIncGst: 10 }], goodsTotalIncGst: 10 });
  assert.equal(shipped.minOrderIncGst, 1000);
  assert.equal(
    financeFloorError(shipped.minOrderIncGst),
    "Finance is available on orders of $1,000 or more (including GST). Please choose another way to pay."
  );
});

test("a storefront's own rates drive both weekly figures", () => {
  const settings = { minOrderIncGst: 1000, rates: { standard: 0.06, skope: 0.04 } };
  const offer = financeOfferForCart({
    lines: [{ amountIncGst: 8377, sku: "SKO-1" }],
    goodsTotalIncGst: 8377,
    settings,
  });
  // 8377 x 0.06 x 12 / 52 and 8377 x 0.04 x 12 / 52
  assert.equal(offer.silverchefWeekly, 115.99);
  assert.equal(offer.skopeWeekly, 77.33);
  assert.equal(weeklyBadgeForMethod("silverchef", offer)?.text, "Rent per Week: $115.99");
});

test("an unusable stored floor can never finance a small basket", () => {
  for (const junk of [0, -1, Number.NaN]) {
    const offer = financeOfferForCart({
      lines: [{ amountIncGst: 12 }],
      goodsTotalIncGst: 12,
      settings: { minOrderIncGst: junk, rates: { standard: 0.055, skope: 0.03625 } },
    });
    assert.equal(offer.eligible, false, `floor ${junk} financed a $12 basket`);
  }
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
