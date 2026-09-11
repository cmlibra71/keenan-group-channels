import { test } from "node:test";
import assert from "node:assert/strict";
import {
  JOIN_PITCH,
  JOIN_PITCH_SCALE,
  joinPitch,
  checkoutOfferCopy,
  memberStateLine,
  subscribeOfferCopy,
  type FreeTrialView,
} from "./free-trial-copy";

test("a free period renames the button, exactly as the card asks", () => {
  const copy = checkoutOfferCopy({
    kind: "free",
    identified: true,
    periodLabel: "3 months",
    endsLabel: "4 December 2026",
    priceLabel: "$14.95",
    pending: false,
  });
  // The CARD asks for the BUTTON to say it. The headline says what is true of this
  // shopper — and is deliberately a DIFFERENT sentence, or the banner prints the offer's
  // name twice, once as its heading and again on the link right beneath it.
  assert.equal(copy.cta, "Free membership — 3 months");
  assert.equal(copy.headline, "Your first 3 months are free");
  assert.notEqual(copy.headline, copy.cta);
  assert.equal(copy.highlight, true);
  assert.equal(copy.linkToPlan, true);
  // The card's "rolls automatically into the paid monthly membership" — said in words.
  assert.match(copy.detail ?? "", /continues at \$14\.95 a month from 4 December 2026/);
  assert.match(copy.detail ?? "", /cancel any time before that/);
});

test("a free period with no end date still says paid membership follows", () => {
  const copy = checkoutOfferCopy({
    kind: "free",
    identified: true,
    periodLabel: "3 months",
    endsLabel: null,
    priceLabel: "$14.95",
    pending: false,
  });
  assert.match(copy.detail ?? "", /continues at \$14\.95 a month/);
});

test("A VISITOR WE CANNOT IDENTIFY IS NEVER PROMISED FREE MONTHS", () => {
  // The checkout is open signed-out on Chefs Depot, and the free period is claimable
  // once per person, ever. Somebody who already burnt theirs and is signed out would
  // otherwise read "Free membership — 3 months" here and be charged from day one the
  // moment they sign in on the next screen.
  const copy = checkoutOfferCopy({
    kind: "free",
    identified: false,
    periodLabel: "3 months",
    endsLabel: "4 December 2026",
    priceLabel: "$14.95",
    pending: false,
  });
  assert.equal(copy.headline, JOIN_PITCH);
  assert.equal(copy.cta, "Join members");
  assert.equal(copy.highlight, false);
  // No link straight at the payment page either: they cannot subscribe signed out.
  assert.equal(copy.linkToPlan, false);
  assert.equal(
    copy.detail,
    "Your first 3 months are free if you have not had them before. It then continues at $14.95 a month, and you can cancel any time before that."
  );
  assert.doesNotMatch(copy.detail ?? "", /from 4 December 2026/);
});

test("an unidentified visitor short of the threshold gets the same caveat", () => {
  const copy = checkoutOfferCopy({
    kind: "earn",
    identified: false,
    periodLabel: "3 months",
    shortfallLabel: "$187.45",
    thresholdLabel: "$1000.00",
  });
  assert.equal(
    copy.detail,
    "Spend $187.45 more on this order and your first 3 months are free, if you have not had them before."
  );
});

test("a basket short of the threshold says how much more, and keeps Tim's pitch", () => {
  const copy = checkoutOfferCopy({
    kind: "earn",
    identified: true,
    periodLabel: "3 months",
    shortfallLabel: "$187.45",
    thresholdLabel: "$1000.00",
  });
  assert.equal(copy.headline, JOIN_PITCH);
  assert.equal(copy.detail, "Spend $187.45 more on this order and your first 3 months are free.");
  assert.equal(copy.cta, "Join members");
  assert.equal(copy.highlight, false);
});

test("THE REFUSAL names the date the first free period ran", () => {
  const copy = checkoutOfferCopy({
    kind: "used",
    identified: true,
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
    identified: true,
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
  const copy = checkoutOfferCopy({ kind: "paid", identified: true });
  assert.equal(copy.headline, JOIN_PITCH);
  assert.equal(copy.detail, null);
  assert.equal(copy.highlight, false);
  assert.equal(copy.linkToPlan, false);
});

test("the subscribe page says the same thing about the money", () => {
  const free = subscribeOfferCopy({
    kind: "free",
    identified: true,
    periodLabel: "3 months",
    endsLabel: "4 December 2026",
    priceLabel: "$14.95",
    pending: false,
  });
  // Same facts, same words — split differently. The checkout leads with the claim as a
  // headline and follows with the rollover; the subscribe page, which has no banner,
  // says both in one sentence. Neither may drift from the other.
  const checkout = checkoutOfferCopy({
    kind: "free",
    identified: true,
    periodLabel: "3 months",
    endsLabel: "4 December 2026",
    priceLabel: "$14.95",
    pending: false,
  });
  assert.equal(free, `${checkout.headline}. ${checkout.detail}`);

  const used = subscribeOfferCopy({
    kind: "used",
    identified: true,
    periodLabel: "3 months",
    usedOnLabel: "14 June 2026",
    priceLabel: "$14.95",
  });
  assert.match(used ?? "", /already had your 3 months free — it ran from 14 June 2026/);
});

test("the subscribe page adds nothing when there is nothing extra to say", () => {
  assert.equal(subscribeOfferCopy({ kind: "paid", identified: true }), null);
});

test("THE PROMISE IS NOT BROKEN: a pending offer says the free months come with the order", () => {
  // The checkout offers the free months against a BASKET. If the button sent the
  // shopper off to pay for the membership first, the order would not exist yet, the
  // grant would (correctly) be refused, and they would be charged from day one having
  // just been told it was free.
  const copy = checkoutOfferCopy({
    kind: "free",
    identified: true,
    periodLabel: "3 months",
    endsLabel: "4 December 2026",
    priceLabel: "$14.95",
    pending: true,
  });
  assert.equal(copy.headline, "Place this order and your first 3 months are free");
  assert.equal(copy.cta, "Free membership — 3 months");
  assert.notEqual(copy.headline, copy.cta);
  assert.equal(copy.linkToPlan, false);
  assert.equal(
    copy.detail,
    "It then continues at $14.95 a month, and you can cancel any time before that."
  );
  // No end date on a pending offer: the free period starts when the order is placed.
  assert.doesNotMatch(copy.detail ?? "", /from 4 December 2026/);
  assert.doesNotMatch(copy.headline, /from 4 December 2026/);
});

test("the subscribe page says what earns the free months rather than going quiet", () => {
  assert.equal(
    subscribeOfferCopy({
      kind: "earn",
      identified: true,
      periodLabel: "3 months",
      shortfallLabel: "$10.00",
      thresholdLabel: "$1000.00",
    }),
    "Your first 3 months are free on an order of $1000.00 or more. Join now and this membership is charged from today."
  );
});

test("A MEMBER ALWAYS GETS A LINE, savings or no savings", () => {
  // The measured saving is list value minus what is charged, so a basket whose lines
  // carry no list_price produces nothing — which is most baskets. The old screen then
  // said nothing at all to a member about their membership.
  assert.equal(
    memberStateLine({ savingsLabel: null, membershipNumber: null }),
    "Your membership is active and member pricing is applied to this order"
  );
  assert.equal(
    memberStateLine({ savingsLabel: null, membershipNumber: "M-000079" }),
    "Your membership is active and member pricing is applied to this order — membership M-000079"
  );
  // The measured sentence is UNCHANGED in substance (register: Nyp8bkPm keeps this one).
  assert.match(
    memberStateLine({ savingsLabel: "$12.34", membershipNumber: null }),
    /^You're saving \$12\.34 with your membership on this order$/
  );
});

test("no sentence anywhere reintroduces the retired savings estimate", () => {
  const all = [
    checkoutOfferCopy({ kind: "free", identified: true, periodLabel: "3 months", endsLabel: null, priceLabel: "$14.95", pending: false }),
    checkoutOfferCopy({ kind: "free", identified: true, periodLabel: "3 months", endsLabel: null, priceLabel: "$14.95", pending: true }),
    checkoutOfferCopy({ kind: "free", identified: false, periodLabel: "3 months", endsLabel: null, priceLabel: "$14.95", pending: false }),
    checkoutOfferCopy({ kind: "earn", identified: true, periodLabel: "3 months", shortfallLabel: "$1.00", thresholdLabel: "$1000.00" }),
    checkoutOfferCopy({ kind: "earn", identified: false, periodLabel: "3 months", shortfallLabel: "$1.00", thresholdLabel: "$1000.00" }),
    checkoutOfferCopy({ kind: "used", identified: true, periodLabel: "3 months", usedOnLabel: "1 June 2026", priceLabel: "$14.95" }),
    checkoutOfferCopy({ kind: "paid", identified: true }),
  ];
  for (const copy of all) {
    const text = `${copy.headline} ${copy.detail ?? ""} ${copy.cta}`;
    assert.doesNotMatch(text, /Members save up to/i);
    assert.doesNotMatch(text, /save up to \$/i);
  }
  const member = memberStateLine({ savingsLabel: "$5.00", membershipNumber: "M-000001" });
  assert.doesNotMatch(member, /save up to/i);
});

// `namesPrice` is the panel's ONE test for whether it may also print the plan's flat
// "$14.95 per month" line (card pktBo874 folded the banner into the Order Summary rail, so both
// sentences now sit in one box). Its contract: true exactly when `detail` itself quotes a monthly
// price. If a future state's detail starts or stops naming a price, this flag moves with it —
// nothing downstream re-reads `view.kind`.
test("namesPrice is true exactly when the detail sentence quotes a monthly price", () => {
  const cases: Array<[FreeTrialView, boolean]> = [
    [{ kind: "free", identified: true, periodLabel: "3 months", endsLabel: "12 December 2026", priceLabel: "$14.95", pending: false }, true],
    [{ kind: "free", identified: true, periodLabel: "3 months", endsLabel: null, priceLabel: "$14.95", pending: true }, true],
    [{ kind: "free", identified: false, periodLabel: "3 months", endsLabel: null, priceLabel: "$14.95", pending: false }, true],
    // No price to quote: the rollover sentence falls back to a date, so the flat price line is the
    // only place the shopper can read what it costs and must NOT be suppressed.
    [{ kind: "free", identified: true, periodLabel: "3 months", endsLabel: "12 December 2026", priceLabel: null, pending: false }, false],
    [{ kind: "earn", identified: true, periodLabel: "3 months", shortfallLabel: "$240.00", thresholdLabel: "$1,000.00" }, false],
    [{ kind: "used", identified: true, periodLabel: "3 months", usedOnLabel: "4 March 2026", priceLabel: "$14.95" }, true],
    [{ kind: "used", identified: true, periodLabel: "3 months", usedOnLabel: "4 March 2026", priceLabel: null }, false],
    [{ kind: "paid", identified: true }, false],
  ];
  for (const [view, expected] of cases) {
    const copy = checkoutOfferCopy(view);
    assert.equal(copy.namesPrice, expected, JSON.stringify(view));
    // The flag has to agree with the sentence it describes, or the panel hides the wrong line.
    if (copy.detail) {
      assert.equal(/\$\d/.test(copy.detail) && /a month/.test(copy.detail), expected, copy.detail);
    } else {
      assert.equal(expected, false);
    }
  }
});

test("with the Chefs Depot member price scale ON the pitch promises no reprice on the next order (gk23c1VK)", () => {
  // Under the scale a new member pays the standard price at $0 of spend, so
  // "every line reprices from your next order" would be false.
  const on = checkoutOfferCopy({ identified: true, kind: "paid" }, { scaleOn: true });
  assert.equal(on.headline, JOIN_PITCH_SCALE);
  assert.doesNotMatch(on.headline, /reprices from your next order/);
  assert.match(on.headline, /every dollar you spend as a member moves your pricing/);
  // Off (every channel today) keeps Tim's cost-plus sentence exactly.
  assert.equal(checkoutOfferCopy({ identified: true, kind: "paid" }).headline, JOIN_PITCH);
  assert.equal(joinPitch(false), JOIN_PITCH);
  assert.equal(joinPitch(true), JOIN_PITCH_SCALE);
  // It sits beside Pay Now: the same pins the cost-plus sentence carries.
  assert.doesNotMatch(JOIN_PITCH_SCALE, /[%$]/);
  assert.doesNotMatch(JOIN_PITCH_SCALE, /\bsave\b/i);
  assert.doesNotMatch(JOIN_PITCH_SCALE, /this order/i);
});
