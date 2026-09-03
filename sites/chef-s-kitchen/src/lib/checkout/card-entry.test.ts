import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CARD_DETAILS_REQUIRED,
  cardEntryBlocksSubmit,
  cardEntryMessage,
  shouldConfirmStripeResult,
} from "./card-entry.ts";

const base = {
  paymentMethod: "stripe",
  cardFormMounted: true,
  heldForSpecialised: false,
  payableTotalIncTax: 100,
  cardComplete: false,
};

test("a blank card on the card method stops the submit", () => {
  assert.equal(cardEntryBlocksSubmit(base), true);
});

test("a complete card lets the submit through", () => {
  assert.equal(cardEntryBlocksSubmit({ ...base, cardComplete: true }), false);
});

test("no other payment method is ever blocked", () => {
  for (const paymentMethod of ["bank_transfer", "net_terms", "silverchef", "finance", ""]) {
    assert.equal(
      cardEntryBlocksSubmit({ ...base, paymentMethod }),
      false,
      `${paymentMethod || "(none)"} must not be blocked`
    );
  }
});

test("a specialised bulky delivery takes no card, so it is never blocked", () => {
  assert.equal(cardEntryBlocksSubmit({ ...base, heldForSpecialised: true }), false);
});

test("a zero-value cart takes no card either, so it is never blocked", () => {
  // The other no-payment shape placeOrder knows (`nothingToPay`, card NmAfwrdE).
  // The card method is the DEFAULT on Chefs Depot, so without this a $0 cart
  // would be told to enter card details it can never be charged on.
  assert.equal(cardEntryBlocksSubmit({ ...base, payableTotalIncTax: 0 }), false);
  assert.equal(cardEntryBlocksSubmit({ ...base, payableTotalIncTax: -5 }), false);
});

test("an unusable total is never a refusal the shopper cannot clear", () => {
  assert.equal(cardEntryBlocksSubmit({ ...base, payableTotalIncTax: NaN }), false);
});

test("a cart worth even a cent still needs a card", () => {
  assert.equal(cardEntryBlocksSubmit({ ...base, payableTotalIncTax: 0.01 }), true);
});

test("with no card form on the page there is nothing to complete", () => {
  // No publishable key: the element never mounts and the button is already
  // disabled on cardReady. Blocking here as well would be a dead end with no
  // way out of it.
  assert.equal(cardEntryBlocksSubmit({ ...base, cardFormMounted: false }), false);
});

test("Stripe's own words win where it gave us any", () => {
  assert.equal(
    cardEntryMessage("Your card number is incomplete.", true),
    "Your card number is incomplete."
  );
  assert.equal(
    cardEntryMessage("Your card was declined.", false),
    "Your card was declined."
  );
});

test("a blank box Stripe said nothing about gets the plain sentence", () => {
  assert.equal(cardEntryMessage(null, true), CARD_DETAILS_REQUIRED);
  assert.equal(cardEntryMessage(undefined, true), CARD_DETAILS_REQUIRED);
  assert.equal(cardEntryMessage("", true), CARD_DETAILS_REQUIRED);
});

test("nothing to say means nothing on screen", () => {
  assert.equal(cardEntryMessage(null, false), null);
});

test("one confirmation per placeOrder result", () => {
  const result = { clientSecret: "pi_1_secret_a" };
  assert.equal(shouldConfirmStripeResult(null, result), true);
  assert.equal(shouldConfirmStripeResult(result, result), false);
});

test("a retry after a decline confirms again, even on the SAME client secret", () => {
  // placeOrder reuses the open awaiting_payment order for this cart and
  // createStripePaymentIntent is idempotent on (orderId, amount), so the secret
  // comes back unchanged. Keying the guard on the secret would leave a shopper
  // whose first card was declined unable to pay at all.
  const first = { clientSecret: "pi_1_secret_a" };
  const retry = { clientSecret: "pi_1_secret_a" };
  assert.equal(shouldConfirmStripeResult(first, retry), true);
});

test("no stripe result means no confirmation", () => {
  assert.equal(shouldConfirmStripeResult(null, null), false);
  assert.equal(shouldConfirmStripeResult(null, undefined), false);
  assert.equal(shouldConfirmStripeResult({ clientSecret: "x" }, null), false);
});
