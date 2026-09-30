// ============================================================================
// A GIFT CARD ON A QUOTE — Industry Kitchens, Zoey parity.
//
// Zoey sells IK's gift card by quote only (Add to Basket withheld; the storefront keeps its
// `cart_disabled` rule). ADD TO QUOTE carries what the gift card panel asked for — the amount and
// the recipient / sender details — onto the quote line, so the rep receives the card the customer
// actually asked for rather than a bare $0 "Gift Card".
//
// THE MONEY. The line is priced at the chosen face value, in the storefront's own tax basis
// (`giftCardUnitPrice`: $50 inc GST is stored as 45.4545 on Industry Kitchens' ex-GST catalogue),
// from an amount re-validated against the PRODUCT'S OWN configuration by `validateGiftCardSelection`
// — the page states a choice, never a price. It is written `price_source = "manual"`, because it is
// the customer's chosen face value and not a catalogue price: the engine reprice paths
// (`QuoteService.repriceItems`, the nightly auto-reprice, the reprice-on-view/accept) skip a manual
// line, so none re-derives it from the product's $0 catalogue price. The portal's own bulk levers
// that do not consult `price_source` (Apply tier pricing, Apply offers, a per-line group override)
// refuse or skip a gift card line explicitly — see the portal's `lib/quotes/gift-card-line.ts`.
//
// ONE LINE PER CARD. A card names who it is for, so two cards are two lines — as Zoey keeps them
// (services `QuoteItemService` exempts gift card lines from "one line per product"). A press that
// repeats a card already on the quote (same amount, same people, same message) adds to that line;
// anything else is a new line. No press ever rewrites or removes a card already on the quote.
//
// AT MOST 50 CARDS A LINE (`GIFT_CARD_MAX_QUANTITY`, also enforced by `QuoteItemService`): the 4-dp
// ex-GST unit re-grosses to the face value to the cent only up to there.
//
// Pure, so every branch is unit-tested (`gift-card-quote-line.test.ts`).
// ============================================================================

import {
  GIFT_CARD_MAX_QUANTITY,
  giftCardLineKey,
  giftCardOptionLines,
  readQuoteLineGiftCard,
  type GiftCardLine,
} from "@keenan/services/gift-card";

/** The line attribute the card is recorded under (`quote_items.attributes.gift_card`). */
export const GIFT_CARD_QUOTE_ATTRIBUTE = "gift_card";

/** The comment the storefront writes on a gift card line — the rep and the customer both read it. */
export function giftCardQuoteNote(line: GiftCardLine): string {
  return ["Gift card", ...giftCardOptionLines(line)].join("\n");
}

export interface ExistingQuoteLine {
  id: number;
  product_id?: number | null;
  quantity: number;
  attributes?: unknown;
}

export type GiftCardQuoteWrite =
  | {
      kind: "create";
      quantity: number;
      listPrice: string;
      attributes: Record<string, unknown>;
      customerNotes: string;
    }
  | { kind: "increment"; itemId: number; quantity: number }
  | { kind: "refuse"; error: string };

/** How many cards one press asks for: the Qty box, a whole number from 1 to the cap. */
export function giftCardPressQuantity(requested: unknown): number {
  const n = Math.floor(Number(requested));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/**
 * What one Add to Quote press does with a validated gift card.
 *
 * `lines` are THIS product's lines already on the quote. `unitPrice` is
 * `giftCardUnitPrice(line.amount_inc_tax, pricesIncludeTax)`, computed by the caller.
 */
export function planGiftCardQuoteWrite(input: {
  lines: ExistingQuoteLine[];
  line: GiftCardLine;
  unitPrice: string;
  addUnits: number;
}): GiftCardQuoteWrite {
  const add = giftCardPressQuantity(input.addUnits);
  const key = giftCardLineKey(input.line);
  const same = input.lines.find((l) => {
    const card = readQuoteLineGiftCard(l.attributes);
    return card != null && giftCardLineKey(card) === key;
  });
  const total = (same ? Number(same.quantity) || 0 : 0) + add;
  if (total > GIFT_CARD_MAX_QUANTITY) {
    return {
      kind: "refuse",
      error: `A quote can hold up to ${GIFT_CARD_MAX_QUANTITY} of the same gift card. Please contact us for more.`,
    };
  }
  if (same) return { kind: "increment", itemId: same.id, quantity: total };
  const note = giftCardQuoteNote(input.line);
  return {
    kind: "create",
    quantity: add,
    listPrice: input.unitPrice,
    attributes: { [GIFT_CARD_QUOTE_ATTRIBUTE]: { ...input.line }, storefront_note: note },
    customerNotes: note,
  };
}
