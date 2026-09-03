import { test } from "node:test";
import assert from "node:assert/strict";
import type { SavedCard } from "@keenan/services/saved-cards";
import {
  NEW_CARD_CHOICE,
  chosenSavedCard,
  initialSavedCardChoice,
  mayOfferSavedCards,
  mayOfferToSaveCard,
} from "./saved-cards";

const card = (over: Partial<SavedCard> = {}): SavedCard => ({
  id: "pm_mine",
  brand: "Visa",
  last4: "4242",
  exp_month: 4,
  exp_year: 2030,
  billing_name: "Fiona Robinson",
  is_default: true,
  expired: false,
  ...over,
});

test("the shopper's own card is what gets charged", () => {
  assert.equal(chosenSavedCard([card()], "pm_mine")?.id, "pm_mine");
});

test("'use a different card' and a blank choice both mean the card box", () => {
  assert.equal(chosenSavedCard([card()], NEW_CARD_CHOICE), null);
  assert.equal(chosenSavedCard([card()], ""), null);
  assert.equal(chosenSavedCard([card()], null), null);
});

test("a card id that is not on this person's file is refused, not charged", () => {
  // The whole reason placeOrder re-runs this: a posted id is a claim, not a fact.
  assert.equal(chosenSavedCard([card()], "pm_somebody_else"), null);
  assert.equal(chosenSavedCard([], "pm_mine"), null);
});

test("an expired card falls back to the card box rather than refusing the order", () => {
  // It expired between the page rendering and Pay being pressed. Making them type
  // a card is recoverable; a refusal they cannot clear is not.
  assert.equal(chosenSavedCard([card({ expired: true })], "pm_mine"), null);
});

test("only a signed-in card payer is offered saved cards", () => {
  const base = { signedIn: true, paymentMethod: "stripe", cardPaymentAvailable: true };
  assert.equal(mayOfferSavedCards(base), true);
  // A guest has no person record to hang a card on (card LiuLvc5b is the sibling).
  assert.equal(mayOfferSavedCards({ ...base, signedIn: false }), false);
  // Bank transfer, net terms, finance: a saved card is not a payment method.
  assert.equal(mayOfferSavedCards({ ...base, paymentMethod: "bank_transfer" }), false);
  // No usable Stripe credentials: the card method is not even drawn (OHDx84DK).
  assert.equal(mayOfferSavedCards({ ...base, cardPaymentAvailable: false }), false);
});

test("the offer to keep a card appears only where there is a person and a new card", () => {
  const base = { signedIn: true, paymentMethod: "stripe", usingSavedCard: false };
  assert.equal(mayOfferToSaveCard(base), true);
  assert.equal(mayOfferToSaveCard({ ...base, signedIn: false }), false);
  assert.equal(mayOfferToSaveCard({ ...base, usingSavedCard: true }), false);
  assert.equal(mayOfferToSaveCard({ ...base, paymentMethod: "net_terms" }), false);
});

test("a card is pre-ticked only where the choice is unambiguous", () => {
  const visa = card({ id: "pm_visa", brand: "Visa", is_default: false });
  const amex = card({ id: "pm_amex", brand: "American Express", is_default: false });

  // Stripe's own default is the shopper's stated preference.
  assert.equal(
    initialSavedCardChoice([visa, card({ id: "pm_default", is_default: true })])?.id,
    "pm_default"
  );
  // One usable card: there is nothing to get wrong.
  assert.equal(initialSavedCardChoice([visa])?.id, "pm_visa");
  // TWO usable cards and no default: nothing is ticked. Picking one for them
  // alphabetically would move money off a card they never chose.
  assert.equal(initialSavedCardChoice([amex, visa]), null);
  // An expired card is never pre-selected, and never counts towards "only one".
  assert.equal(initialSavedCardChoice([card({ id: "pm_dead", expired: true }), visa])?.id, "pm_visa");
  assert.equal(initialSavedCardChoice([card({ id: "pm_dead", expired: true })]), null);
  assert.equal(initialSavedCardChoice([]), null);
});
