import { test } from "node:test";
import assert from "node:assert/strict";
import { JOIN_PITCH, checkoutOfferCopy, subscribeOfferCopy } from "./free-trial-copy";

test("a free period renames the button, exactly as the card asks", () => {
  const copy = checkoutOfferCopy({
    kind: "free",
    periodLabel: "3 months",
    endsLabel: "4 December 2026",
    priceLabel: "$14.95",
    pending: false,
  });
  assert.equal(copy.headline, "Free membership — 3 months");
  assert.equal(copy.cta, "Free membership — 3 months");
  assert.match(copy.detail ?? "", /Your first 3 months are free\./);
  // The card's "rolls automatically into the paid monthly membership" — said in words.
  assert.match(copy.detail ?? "", /continues at \$14\.95 a month from 4 December 2026/);
  assert.match(copy.detail ?? "", /cancel any time before that/);
});

test("a free period with no end date still says paid membership follows", () => {
  const copy = checkoutOfferCopy({
    kind: "free",
    periodLabel: "3 months",
    endsLabel: null,
    priceLabel: "$14.95",
    pending: false,
  });
  assert.match(copy.detail ?? "", /continues at \$14\.95 a month/);
});

test("a basket short of the threshold says how much more, and keeps Tim's pitch", () => {
  const copy = checkoutOfferCopy({
    kind: "earn",
    periodLabel: "3 months",
    shortfallLabel: "$187.45",
    thresholdLabel: "$1000.00",
  });
  assert.equal(copy.headline, JOIN_PITCH);
  assert.equal(copy.detail, "Spend $187.45 more on this order and your first 3 months are free.");
  assert.equal(copy.cta, "Join members");
});

test("THE REFUSAL names the date the first free period ran", () => {
  const copy = checkoutOfferCopy({
    kind: "used",
    periodLabel: "3 months",
    usedOnLabel: "14 June 2026",
    priceLabel: "$14.95",
  });
  assert.equal(copy.headline, JOIN_PITCH);
  assert.equal(
    copy.detail,
    "You have already had your 3 months free — it ran from 14 June 2026, so this membership is $14.95 a month from today."
  );
  // It refuses the FREE PERIOD, never the membership: the button still joins.
  assert.equal(copy.cta, "Join members");
});

test("a refusal with no date on record still refuses in plain words", () => {
  const copy = checkoutOfferCopy({
    kind: "used",
    periodLabel: "3 months",
    usedOnLabel: null,
    priceLabel: null,
  });
  assert.equal(
    copy.detail,
    "You have already had your 3 months free, so this membership is the standard monthly price from today."
  );
});

test("with no free period on offer the banner is exactly what it was before this card", () => {
  const copy = checkoutOfferCopy({ kind: "paid" });
  assert.equal(copy.headline, JOIN_PITCH);
  assert.equal(copy.detail, null);
});

test("the subscribe page says the same thing about the money", () => {
  const free = subscribeOfferCopy({
    kind: "free",
    periodLabel: "3 months",
    endsLabel: "4 December 2026",
    priceLabel: "$14.95",
    pending: false,
  });
  assert.equal(
    free,
    checkoutOfferCopy({
      kind: "free",
      periodLabel: "3 months",
      endsLabel: "4 December 2026",
      priceLabel: "$14.95",
      pending: false,
    }).detail
  );

  const used = subscribeOfferCopy({
    kind: "used",
    periodLabel: "3 months",
    usedOnLabel: "14 June 2026",
    priceLabel: "$14.95",
  });
  assert.match(used ?? "", /already had your 3 months free — it ran from 14 June 2026/);
});

test("the subscribe page adds nothing when there is nothing extra to say", () => {
  assert.equal(subscribeOfferCopy({ kind: "paid" }), null);
});

test("THE PROMISE IS NOT BROKEN: a pending offer says the free months come with the order", () => {
  // The checkout offers the free months against a BASKET. If the button sent the
  // shopper off to pay for the membership first, the order would not exist yet, the
  // grant would (correctly) be refused, and they would be charged from day one having
  // just been told it was free.
  const copy = checkoutOfferCopy({
    kind: "free",
    periodLabel: "3 months",
    endsLabel: "4 December 2026",
    priceLabel: "$14.95",
    pending: true,
  });
  assert.equal(copy.headline, "Free membership — 3 months");
  assert.equal(copy.cta, "Free membership — 3 months");
  assert.equal(
    copy.detail,
    "Place this order and your first 3 months are free. It then continues at $14.95 a month, and you can cancel any time before that."
  );
  assert.doesNotMatch(copy.detail ?? "", /from 4 December 2026/);
});

test("the subscribe page says what earns the free months rather than going quiet", () => {
  assert.equal(
    subscribeOfferCopy({
      kind: "earn",
      periodLabel: "3 months",
      shortfallLabel: "$10.00",
      thresholdLabel: "$1000.00",
    }),
    "Your first 3 months are free on an order of $1000.00 or more. Join now and this membership is charged from today."
  );
});

test("no sentence anywhere reintroduces the retired savings estimate", () => {
  const all = [
    checkoutOfferCopy({ kind: "free", periodLabel: "3 months", endsLabel: null, priceLabel: "$14.95", pending: false }),
    checkoutOfferCopy({ kind: "free", periodLabel: "3 months", endsLabel: null, priceLabel: "$14.95", pending: true }),
    checkoutOfferCopy({ kind: "earn", periodLabel: "3 months", shortfallLabel: "$1.00", thresholdLabel: "$1000.00" }),
    checkoutOfferCopy({ kind: "used", periodLabel: "3 months", usedOnLabel: "1 June 2026", priceLabel: "$14.95" }),
    checkoutOfferCopy({ kind: "paid" }),
  ];
  for (const copy of all) {
    const text = `${copy.headline} ${copy.detail ?? ""} ${copy.cta}`;
    assert.doesNotMatch(text, /Members save up to/i);
    assert.doesNotMatch(text, /save up to \$/i);
  }
});
