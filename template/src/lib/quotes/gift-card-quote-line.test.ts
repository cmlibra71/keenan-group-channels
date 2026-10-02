import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { giftCardPressQuantity, giftCardQuoteNote, planGiftCardQuoteWrite } from "./gift-card-quote-line.ts";
import { giftCardUnitPrice, type GiftCardLine } from "@keenan/services/gift-card";

const sam: GiftCardLine = {
  amount_inc_tax: "100.00",
  recipient_name: "Sam Chef",
  recipient_email: "sam@example.com",
  sender_name: "Alex",
  sender_email: "alex@example.com",
  message: "Congrats",
};
const jo: GiftCardLine = { ...sam, amount_inc_tax: "500.00", recipient_name: "Jo", recipient_email: "jo@example.com" };
const unit = (l: GiftCardLine) => giftCardUnitPrice(l.amount_inc_tax, false);

describe("gift card quote line — one line per card", () => {
  it("prices a new line at the chosen face value, ex GST (Industry Kitchens' basis)", () => {
    assert.equal(unit(sam), "90.9091");
    const w = planGiftCardQuoteWrite({ lines: [], line: sam, unitPrice: unit(sam), addUnits: 1 });
    assert.equal(w.kind, "create");
    if (w.kind !== "create") return;
    assert.equal(w.listPrice, "90.9091");
    assert.equal(w.quantity, 1);
    assert.deepEqual(w.attributes.gift_card, sam);
    assert.equal(w.attributes.storefront_note, w.customerNotes);
  });

  it("the Qty box sets how many cards the new line holds", () => {
    const w = planGiftCardQuoteWrite({ lines: [], line: sam, unitPrice: unit(sam), addUnits: 3 });
    assert.equal(w.kind === "create" && w.quantity, 3);
  });

  it("the note carries every detail in Zoey's labels", () => {
    assert.equal(
      giftCardQuoteNote(sam),
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

  it("the SAME card again adds to its own line", () => {
    const lines = [{ id: 7, quantity: 2, attributes: { gift_card: { ...sam } } }];
    assert.deepEqual(planGiftCardQuoteWrite({ lines, line: sam, unitPrice: unit(sam), addUnits: 1 }), {
      kind: "increment",
      itemId: 7,
      quantity: 3,
    });
  });

  it("judge scenario A — Sam $100 then Jo $500: Sam's card is kept, Jo gets her own line", () => {
    const lines = [{ id: 7, quantity: 1, attributes: { gift_card: { ...sam } } }];
    const w = planGiftCardQuoteWrite({ lines, line: jo, unitPrice: unit(jo), addUnits: 1 });
    assert.equal(w.kind, "create");
    if (w.kind !== "create") return;
    assert.equal(w.listPrice, "454.5455");
    assert.deepEqual(w.attributes.gift_card, jo);
  });

  it("judge scenario B — Sam $100 x2 then Jo $50: three cards, $250 in total, nothing re-priced", () => {
    const joFifty: GiftCardLine = { ...jo, amount_inc_tax: "50.00" };
    const lines = [{ id: 7, quantity: 2, attributes: { gift_card: { ...sam } } }];
    const w = planGiftCardQuoteWrite({ lines, line: joFifty, unitPrice: unit(joFifty), addUnits: 1 });
    assert.equal(w.kind, "create");
    if (w.kind !== "create") return;
    // Sam's line untouched (2 x 90.9091 ex = $200 inc), Jo's new line 1 x 45.4545 ex = $50 inc.
    const inc = (ex: number) => Math.round(ex * 1.1 * 100) / 100;
    assert.equal(inc(2 * 90.9091) + inc(w.quantity * Number(w.listPrice)), 250);
  });

  it("a bare $0 line added before this shipped is left alone; the card gets its own line", () => {
    const lines = [{ id: 3, quantity: 1, attributes: null }];
    const w = planGiftCardQuoteWrite({ lines, line: sam, unitPrice: unit(sam), addUnits: 1 });
    assert.equal(w.kind, "create");
  });

  it("never more than 50 of one card on a line", () => {
    assert.equal(planGiftCardQuoteWrite({ lines: [], line: sam, unitPrice: unit(sam), addUnits: 50 }).kind, "create");
    assert.equal(planGiftCardQuoteWrite({ lines: [], line: sam, unitPrice: unit(sam), addUnits: 51 }).kind, "refuse");
    const lines = [{ id: 7, quantity: 49, attributes: { gift_card: { ...sam } } }];
    assert.equal(planGiftCardQuoteWrite({ lines, line: sam, unitPrice: unit(sam), addUnits: 1 }).kind, "increment");
    assert.equal(planGiftCardQuoteWrite({ lines, line: sam, unitPrice: unit(sam), addUnits: 2 }).kind, "refuse");
  });

  it("press quantity: junk and zero read as one", () => {
    assert.equal(giftCardPressQuantity(undefined), 1);
    assert.equal(giftCardPressQuantity(0), 1);
    assert.equal(giftCardPressQuantity(-3), 1);
    assert.equal(giftCardPressQuantity("x"), 1);
    assert.equal(giftCardPressQuantity(4.7), 4);
  });
});
