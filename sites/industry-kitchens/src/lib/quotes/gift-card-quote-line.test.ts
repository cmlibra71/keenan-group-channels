import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { giftCardQuoteNote, planGiftCardQuoteWrite } from "./gift-card-quote-line.ts";
import { giftCardUnitPrice, type GiftCardLine } from "@keenan/services/gift-card";

const line: GiftCardLine = {
  amount_inc_tax: "100.00",
  recipient_name: "Sam Chef",
  recipient_email: "sam@example.com",
  sender_name: "Alex",
  sender_email: "alex@example.com",
  message: "Congrats",
};
const unit = giftCardUnitPrice(line.amount_inc_tax, false);

describe("gift card quote line", () => {
  it("prices a new line at the chosen face value, ex GST (Industry Kitchens' basis)", () => {
    assert.equal(unit, "90.9091");
    const w = planGiftCardQuoteWrite({ existing: null, line, unitPrice: unit, addUnits: 1 });
    assert.equal(w.kind, "create");
    if (w.kind !== "create") return;
    assert.equal(w.listPrice, "90.9091");
    assert.equal(w.quantity, 1);
    assert.deepEqual(w.attributes.gift_card, line);
    assert.equal(w.attributes.storefront_note, w.customerNotes);
  });

  it("the note carries every detail in Zoey's labels", () => {
    assert.equal(
      giftCardQuoteNote(line),
      [
        "Gift card",
        "Amount: $100.00 inc GST",
        "Recipient Name: Sam Chef",
        "Recipient Email: sam@example.com",
        "Sender Name: Alex",
        "Sender Email: alex@example.com",
        "Special Message: Congrats",
      ].join("\n")
    );
  });

  it("the SAME card again is one more of it", () => {
    const existing = { quantity: 2, attributes: { gift_card: { ...line } }, customer_notes: "x" };
    assert.deepEqual(planGiftCardQuoteWrite({ existing, line, unitPrice: unit, addUnits: 1 }), {
      kind: "increment",
      quantity: 3,
    });
  });

  it("a DIFFERENT card re-configures the line: price and card replaced, quantity kept", () => {
    const note = giftCardQuoteNote(line);
    const existing = { quantity: 2, attributes: { gift_card: { ...line }, storefront_note: note, other: 1 }, customer_notes: note };
    const next: GiftCardLine = { ...line, amount_inc_tax: "500.00", recipient_email: "jo@example.com" };
    const w = planGiftCardQuoteWrite({ existing, line: next, unitPrice: giftCardUnitPrice("500.00", false), addUnits: 1 });
    assert.equal(w.kind, "reconfigure");
    if (w.kind !== "reconfigure") return;
    assert.equal(w.listPrice, "454.5455");
    assert.deepEqual(w.attributes.gift_card, next);
    assert.equal(w.attributes.other, 1, "other owners' attributes survive");
    assert.equal(w.customerNotes, giftCardQuoteNote(next));
  });

  it("a comment a REP typed is never overwritten", () => {
    const existing = {
      quantity: 1,
      attributes: { gift_card: { ...line }, storefront_note: giftCardQuoteNote(line) },
      customer_notes: "Rep: confirm delivery date",
    };
    const w = planGiftCardQuoteWrite({ existing, line: { ...line, amount_inc_tax: "50.00" }, unitPrice: giftCardUnitPrice("50.00", false), addUnits: 1 });
    assert.equal(w.kind, "reconfigure");
    if (w.kind !== "reconfigure") return;
    assert.equal(w.customerNotes, undefined);
    assert.equal(w.attributes.storefront_note, giftCardQuoteNote(line));
  });

  it("a $0 line added before this shipped (no card on it) is re-configured with the card and its price", () => {
    const existing = { quantity: 1, attributes: null, customer_notes: null };
    const w = planGiftCardQuoteWrite({ existing, line, unitPrice: unit, addUnits: 1 });
    assert.equal(w.kind, "reconfigure");
    if (w.kind !== "reconfigure") return;
    assert.equal(w.listPrice, unit);
    assert.equal(w.customerNotes, giftCardQuoteNote(line));
  });
});
