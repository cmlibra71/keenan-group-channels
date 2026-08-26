import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * SOURCE GUARD: `resolvePaymentAvailability` must be called with the length of
 * the list the checkout page actually RENDERS, and every filter must run above
 * that call.
 *
 * This has now been broken twice, the same way each time, by two different cards:
 *
 *  - VAjaPj0t: the finance floor was applied below the call, so a cart under
 *    $1,000 whose only surviving methods were SilverChef / Finance read
 *    "available", rendered nothing, and left Place Order enabled.
 *  - OHDx84DK: the no-Stripe-credentials card drop was added below the call, so a
 *    channel whose only offerable method is the card did exactly the same thing.
 *
 * The result both times is the dead button with no hint that `sf-checkout`'s
 * "Do not break" list exists to prevent (the pattern that produced 7vu2iEEZ on
 * the product page). No unit test of `resolvePaymentAvailability` itself can see
 * it — the function is correct; the ORDER of the call site is the bug — so this
 * is a source-level guard, the same shape as `customer-payment-list.test.ts`.
 *
 * If you are adding a fourth filter to the checkout page: compute it above the
 * availability call and fold it into `offeredPaymentMethods`.
 */

const SRC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const CHECKOUT_PAGE = path.join(SRC, "app/checkout/page.tsx");

test("the checkout page filters the offered list BEFORE it resolves availability", () => {
  const source = readFileSync(CHECKOUT_PAGE, "utf8");

  const dropAt = source.indexOf("const offeredPaymentMethods =");
  const resolveAt = source.indexOf("resolvePaymentAvailability(");
  assert.notEqual(dropAt, -1, "checkout page no longer builds `offeredPaymentMethods`");
  assert.notEqual(resolveAt, -1, "checkout page no longer calls `resolvePaymentAvailability`");
  assert.ok(
    dropAt < resolveAt,
    "`offeredPaymentMethods` is built BELOW `resolvePaymentAvailability`, so the count and the " +
      "rendered list are different lists: Place Order stays enabled over an empty list, with no hint"
  );
});

test("availability is counted off the rendered list, not the pre-filter one", () => {
  const source = readFileSync(CHECKOUT_PAGE, "utf8");
  const call = source.slice(
    source.indexOf("resolvePaymentAvailability("),
    source.indexOf(");", source.indexOf("resolvePaymentAvailability("))
  );
  assert.ok(
    call.includes("offeredPaymentMethods.length"),
    `availability must be resolved from the rendered list; it is called with: ${call}`
  );
  assert.ok(
    !/\bpaymentMethods\.length\b/.test(call),
    "counting `paymentMethods.length` re-introduces the pre-filter count"
  );
});

test("what the page renders is what it counted", () => {
  const source = readFileSync(CHECKOUT_PAGE, "utf8");
  assert.ok(
    /paymentMethods=\{offeredPaymentMethods\}/.test(source),
    "CheckoutForm must be handed the same list the availability count was taken from"
  );
});

/**
 * The other half of the same rule (`payment-methods`, N8kE8arY / NmAfwrdE):
 * every filter on the page is duplicated in `placeOrder`. `placeOrder` writes the
 * order row BEFORE it calls Stripe, so a filter applied on the page alone does
 * not merely leak a bypass — it strands a numbered, unpaid order and shows the
 * shopper a raw internal error (card OHDx84DK).
 */
const PLACE_ORDER = path.join(SRC, "lib/actions/checkout.ts");

test("placeOrder applies the SAME no-credentials card test the page applies", () => {
  const source = readFileSync(PLACE_ORDER, "utf8");
  assert.ok(
    source.includes("canTakeCardPayment("),
    "placeOrder must use the same predicate as the page, not a second copy of the test"
  );
  const guardAt = source.indexOf("cardUnavailable && paymentMethod === \"stripe\"");
  assert.notEqual(guardAt, -1, "placeOrder no longer refuses a posted card it cannot charge");
  const writeAt = source.indexOf("orderService.create");
  assert.ok(
    writeAt === -1 || guardAt < writeAt,
    "the refusal must come BEFORE the order row is written, or the slip strands an unpaid order"
  );
});

test("placeOrder drops the unchargeable card from both availability counts", () => {
  const source = readFileSync(PLACE_ORDER, "utf8");
  const drops = source.match(/!cardUnavailable \|\| m\.id !== "stripe"/g) ?? [];
  assert.equal(
    drops.length,
    2,
    "the card comes off the offerable list AND the channel count — counting it resolves a " +
      "signed-in shopper to \"account-restricted\" and blames their account for our configuration"
  );
});
