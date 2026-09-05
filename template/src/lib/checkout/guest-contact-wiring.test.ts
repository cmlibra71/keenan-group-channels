import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * SOURCE GUARD for "every completed checkout attaches a customer record"
 * (card LiuLvc5b).
 *
 * The rule is not "call the helper" — it is WHERE the call sits, and no unit
 * test of the helper itself can see that:
 *
 *  - it must run BELOW the order-items write and its compensating delete,
 *    because no record may be created by a save that failed (Product Brief).
 *    Moved above it, an order that fails to persist its lines is deleted and a
 *    contact is left behind for a sale that never happened;
 *  - it must run ABOVE the Stripe early-return, or a card order — every CD
 *    online payment — returns to the browser before the record is filed, and
 *    only bank-transfer and net-terms orders ever get a customer.
 *
 * Same shape and same reason as payment-availability-order.test.ts.
 */
const SRC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const PLACE_ORDER = path.join(SRC, "lib/actions/checkout.ts");

test("placeOrder files the customer record after the lines are safely written", () => {
  const source = readFileSync(PLACE_ORDER, "utf8");
  const callAt = source.indexOf("createGuestContactForCheckout(");
  assert.notEqual(callAt, -1, "placeOrder no longer attaches a customer record to a guest order");

  const itemsAt = source.indexOf("orderItemService.createManyForParent");
  assert.notEqual(itemsAt, -1, "order items write not found — this guard needs rewriting");
  assert.ok(
    itemsAt < callAt,
    "the record must be created only once the order and its lines have persisted"
  );

  // The LAST PaymentIntent call is the one on the order this run just created —
  // the earlier one belongs to the idempotency-reuse branch, which returns long
  // before any of this.
  const stripeReturnAt = source.lastIndexOf("createStripePaymentIntent(order.id");
  assert.notEqual(stripeReturnAt, -1, "Stripe branch not found — this guard needs rewriting");
  assert.ok(
    callAt < stripeReturnAt,
    "the record must be filed before the Stripe early-return, or card orders never get one"
  );
});

test("a shopper who already has a contact is left alone", () => {
  const source = readFileSync(PLACE_ORDER, "utf8");
  assert.ok(
    source.includes("const alreadyLinked = session?.contactId ??"),
    "the guest step must skip a signed-in shopper AND an order OrderService.create already " +
      "stamped (card lpMsJZMM), or it mints a duplicate person for a known address"
  );
});

/**
 * The other half of the card: a record is not an account, so the two customer-
 * facing consequences of creating one have to stay handled.
 */
const REGISTER = path.join(SRC, "lib/actions/auth.ts");
const PANEL = path.join(SRC, "lib/actions/account-panel.ts");

test("registration can claim the record a guest checkout left behind", () => {
  for (const file of [REGISTER, PANEL]) {
    const source = readFileSync(file, "utf8");
    assert.ok(
      source.includes("claimGuestCheckoutContact("),
      `${path.basename(file)} must let a guest claim their own record — without it, ` +
        "\"order as a guest, then create an account\" dead-ends on a sign-in with no password"
    );
    const availabilityAt = source.indexOf("isEmailAvailableForChannel");
    const claimAt = source.indexOf("claimGuestCheckoutContact(");
    assert.ok(
      availabilityAt !== -1 && availabilityAt < claimAt,
      "the claim belongs inside the taken-email refusal, not in front of it"
    );
  }
});

test("the returning-customer hint does not call a guest record an account", () => {
  const source = readFileSync(PANEL, "utf8");
  const hintAt = source.indexOf("export async function emailHasAccount");
  assert.notEqual(hintAt, -1, "emailHasAccount not found — this guard needs rewriting");
  assert.ok(
    source.indexOf("isUnclaimedGuestRecord(", hintAt) !== -1,
    "a repeat guest would be told they already have an account and sent to a sign-in they " +
      "cannot complete"
  );
});
