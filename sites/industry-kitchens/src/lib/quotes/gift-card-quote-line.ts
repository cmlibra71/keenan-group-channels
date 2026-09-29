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
// the customer's chosen face value and not a catalogue price: every reprice path
// (`QuoteService.repriceItems`, the nightly auto-reprice, the reprice-on-accept) skips a manual line,
// so nothing re-derives it from the product's $0 catalogue price.
//
// ONE LINE PER PRODUCT. A quote holds one line per product+variant (the quote-item unique rule), so
// a second press is either "one more of this same card" (same amount, same people, same message:
// the quantity goes up) or a re-configuration (anything different: the line's card, price and —
// only when the storefront wrote it — its comment are replaced, the quantity left alone). That is
// the same rule a re-configured bundle or set of paid extras follows (`addon-line-write.ts`).
//
// Pure, so every branch is unit-tested (`gift-card-quote-line.test.ts`).
// ============================================================================

import {
  giftCardLineKey,
  giftCardOptionLines,
  readGiftCardLine,
  type GiftCardLine,
} from "@keenan/services/gift-card";

/** The line attribute the card is recorded under (`quote_items.attributes.gift_card`). */
export const GIFT_CARD_QUOTE_ATTRIBUTE = "gift_card";

/** The comment the storefront writes on a gift card line — the rep and the customer both read it. */
export function giftCardQuoteNote(line: GiftCardLine): string {
  return ["Gift card", ...giftCardOptionLines(line)].join("\n");
}

export interface ExistingQuoteLine {
  quantity: number;
  customer_notes?: string | null;
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
  | { kind: "increment"; quantity: number }
  | {
      kind: "reconfigure";
      listPrice: string;
      attributes: Record<string, unknown>;
      /** Only set when the comment on the line is the storefront's own (or empty). */
      customerNotes?: string;
    };

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/**
 * What one Add to Quote press does with a validated gift card.
 *
 * `unitPrice` is `giftCardUnitPrice(line.amount_inc_tax, pricesIncludeTax)` — computed by the
 * caller from the validated line, passed in so this stays free of the tax-basis read.
 */
export function planGiftCardQuoteWrite(input: {
  existing: ExistingQuoteLine | null;
  line: GiftCardLine;
  unitPrice: string;
  addUnits: number;
}): GiftCardQuoteWrite {
  const note = giftCardQuoteNote(input.line);
  const record = { [GIFT_CARD_QUOTE_ATTRIBUTE]: { ...input.line } };
  if (!input.existing) {
    return {
      kind: "create",
      quantity: Math.max(1, input.addUnits),
      listPrice: input.unitPrice,
      attributes: { ...record, storefront_note: note },
      customerNotes: note,
    };
  }
  const attrs = asRecord(input.existing.attributes);
  const current = readGiftCardLine({ gift_card: attrs[GIFT_CARD_QUOTE_ATTRIBUTE] });
  if (current && giftCardLineKey(current) === giftCardLineKey(input.line)) {
    return { kind: "increment", quantity: input.existing.quantity + Math.max(1, input.addUnits) };
  }
  const existingNote = input.existing.customer_notes ?? null;
  const ownedNote = typeof attrs.storefront_note === "string" ? attrs.storefront_note : null;
  const writesNote = !existingNote || existingNote === ownedNote;
  return {
    kind: "reconfigure",
    listPrice: input.unitPrice,
    attributes: { ...attrs, ...record, ...(writesNote ? { storefront_note: note } : {}) },
    ...(writesNote ? { customerNotes: note } : {}),
  };
}
