// ============================================================================
// A returning customer's own card, at the checkout (card JiaDTjr1).
//
// Cards live in STRIPE, against the PERSON — never against the company. Tim
// demonstrated a contact with no company account whose cards still appeared, so
// the lookup is by contact and by nothing else. What we hold is the join key,
// per Stripe account (services `payments/contactStripeCustomers.ts`).
//
// WHY THIS MODULE IS PURE AND SEPARATE. The checkout page draws the list and
// `placeOrder` accepts what comes back, and those two have to reach the SAME
// verdict about a posted card id or the checkout offers a card it then refuses —
// or, far worse, charges a card that is not this shopper's. That is the
// show-equals-accept rule the sf-checkout register states for every other filter
// on this screen, and a saved card is one more filter. The verdict itself is
// `selectableSavedCard` in `@keenan/services`, shared with the portal's capture
// dialog; what lives here is the CHECKOUT's own policy around it.
//
// A GUEST IS NEVER OFFERED A CARD, and that is not a limitation to work around:
// a saved card hangs off a person, a guest has no person record, and inventing
// one at checkout is card LiuLvc5b's job, not this one's. Industry Kitchens
// requires a sign-in anyway; on Chefs Depot a guest simply sees the card box, as
// they do today.
//
// A SAVED CARD IS NOT A WAY PAST THE PAYMENT-METHOD GATE (card NmAfwrdE x
// N8kE8arY). It is a way of paying by CARD, so it is only ever offered inside the
// `stripe` method, after that method has survived the channel's customer list,
// the account's allow-list and the account's staff-only list. Nothing here
// widens what a shopper may pay with; `placeOrder` re-checks the method first and
// the card second.
//
// Pure. No imports beyond the shared card shape, no I/O.
// ============================================================================

// The client-safe SUBPATH, never the barrel: this module is imported by
// `CheckoutForm` ("use client"), and pulling the services index into a browser
// bundle fails the build on sharp's `child_process` require.
import { selectableSavedCard, type SavedCard } from "@keenan/services/saved-cards";

/** The radio value for "use a different card", and the default when nothing is on file. */
export const NEW_CARD_CHOICE = "new";

/**
 * Which of the shopper's cards, if any, this submit is pointed at.
 *
 * `NEW_CARD_CHOICE`, an empty value, an unknown id and an EXPIRED card all mean
 * the same thing — the card box — so a shopper whose only card expired between
 * rendering and pressing Pay types a new one rather than meeting a refusal they
 * cannot clear.
 */
export function chosenSavedCard(
  cards: readonly SavedCard[],
  choice: string | null | undefined
): SavedCard | null {
  if (!choice || choice === NEW_CARD_CHOICE) return null;
  return selectableSavedCard(cards, choice);
}

/**
 * Is this shopper allowed to be OFFERED saved cards at all?
 *
 * Signed in (a card belongs to a person), paying by card, and the storefront can
 * actually take one. The last is not belt and braces: when a channel has no
 * usable Stripe credentials the page drops the card method entirely (card
 * OHDx84DK), and drawing a card picker under a method that is not there would be
 * a control with nothing behind it.
 */
export function mayOfferSavedCards(input: {
  signedIn: boolean;
  paymentMethod: string;
  cardPaymentAvailable: boolean;
}): boolean {
  return input.signedIn && input.paymentMethod === "stripe" && input.cardPaymentAvailable;
}

/**
 * May we offer to KEEP the card the shopper is about to type?
 *
 * Only for a signed-in shopper typing a NEW card. Offering it to a guest is a
 * promise we cannot honour — there is no person to save it against — and
 * offering it beside a card already on file is meaningless.
 */
export function mayOfferToSaveCard(input: {
  signedIn: boolean;
  paymentMethod: string;
  usingSavedCard: boolean;
}): boolean {
  return input.signedIn && input.paymentMethod === "stripe" && !input.usingSavedCard;
}

/**
 * The line a shopper reads when their storefront could not reach Stripe to look
 * for their cards.
 *
 * It says what happened and what to do, and it deliberately does NOT say "you
 * have no saved cards": telling a returning customer that, when they have three,
 * is the complaint this whole card came from. The card box is still there, so
 * nothing is blocked — this is an explanation, never a refusal.
 */
export const SAVED_CARDS_UNAVAILABLE =
  "We couldn't load your saved cards just now. You can still pay by entering your card below.";

/**
 * The line a shopper reads when the SERVER declined the card they chose.
 *
 * `placeOrder` re-reads every posted card id off that person's own file, and it
 * can legitimately come back with nothing: the card was removed or expired
 * between rendering and pressing Pay, or Stripe could not be reached to confirm
 * it is theirs. The order is already written by then, so the only good answer is
 * to put the card box back in front of them and say why — never to confirm the
 * payment with a card the server just refused, which is a Stripe error the
 * shopper cannot act on, behind a hidden card box.
 */
export const SAVED_CARD_NOT_USABLE =
  "We couldn't use your saved card. Please enter your card details below to finish paying.";

/**
 * PURE. Which card should be TICKED when the checkout first draws the picker?
 *
 * Only where the choice is unambiguous, because this decides which card a
 * returning shopper pays with if they read nothing: Stripe's own default card, or
 * a single usable card. With two usable cards and no default, nothing is
 * pre-selected — picking one for them alphabetically is money moving off a card
 * they did not choose. `null` means "use a different card", i.e. the box, which
 * is where a shopper with no cards already is.
 */
export function initialSavedCardChoice(cards: readonly SavedCard[]): SavedCard | null {
  const usable = cards.filter((c) => !c.expired);
  const preferred = usable.find((c) => c.is_default);
  if (preferred) return preferred;
  return usable.length === 1 ? usable[0] : null;
}
