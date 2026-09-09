import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildFreeTrialOffer,
  type FreeTrialReaders,
  type QualifyingOrderRow,
} from "./free-trial-offer";
import type { PriorFreeTrial } from "@keenan/services/membership-trial";

/** Readers that answer "nothing configured, nobody has had anything" unless overridden. */
function readersFor(over: Partial<FreeTrialReaders> = {}): FreeTrialReaders {
  return {
    readPriorFreeTrial: async () => null,
    readQualifyingOrder: async () => null,
    readThresholdIncTax: async () => 0,
    formatDate: (value) => (value ? String(value) : null),
    ...over,
  };
}

const SPENT: PriorFreeTrial = {
  subscription_id: 79,
  granted_at: "2026-04-01T00:00:00.000Z",
  days: 90,
  basis: "plan",
};

test("a person who has never had the free months is granted them", async () => {
  const offer = await buildFreeTrialOffer(readersFor(), { contactId: 55, trialDays: 90 });
  assert.equal(offer.decision.granted, true);
  assert.equal(offer.grantedDays, 90);
  assert.equal(offer.view.kind, "free");
});

test("a person who has already spent them is refused, and told when they ran", async () => {
  const offer = await buildFreeTrialOffer(readersFor({ readPriorFreeTrial: async () => SPENT }), {
    contactId: 55,
    trialDays: 90,
  });
  assert.equal(offer.decision.granted, false);
  assert.equal(offer.grantedDays, 0);
  assert.equal(offer.view.kind, "used");
});

// THE CARD'S OWN GUARD. `createSubscription` resolves the offer at the moment the free
// period is SPENT. If a failed eligibility read read as "never had one", a returning
// subscriber would be handed a second free period and a fresh stamp — cancel-and-resign
// would work again, which is the whole thing Tim asked us to stop.
test("the grant path REFUSES rather than granting when eligibility cannot be read", async () => {
  const readers = readersFor({
    readPriorFreeTrial: async () => {
      throw new Error("connection terminated unexpectedly");
    },
  });

  await assert.rejects(
    () => buildFreeTrialOffer(readers, { contactId: 55, trialDays: 90, forGrant: true }),
    /connection terminated unexpectedly/
  );
});

test("the grant path fails closed with a threshold set too — no second read can rescue it", async () => {
  const readers = readersFor({
    readThresholdIncTax: async () => 1000,
    readPriorFreeTrial: async () => {
      throw new Error("db down");
    },
    readQualifyingOrder: async (): Promise<QualifyingOrderRow> => ({
      order_id: 1,
      total_inc_tax: 5000,
    }),
  });

  await assert.rejects(
    () => buildFreeTrialOffer(readers, { contactId: 55, trialDays: 90, forGrant: true }),
    /db down/
  );
});

// The display path is deliberately softer: a banner that fails to render costs nothing,
// and nothing is granted by a page. It must still render — but the moment it decides
// anything, the grant path re-decides it from scratch and fails closed.
test("the display path still renders when eligibility cannot be read", async () => {
  const offer = await buildFreeTrialOffer(
    readersFor({
      readPriorFreeTrial: async () => {
        throw new Error("db down");
      },
    }),
    { contactId: 55, trialDays: 90 }
  );
  assert.equal(offer.decision.granted, true);
  assert.equal(offer.view.identified, true);
});

test("a signed-out visitor is never read from the database at all", async () => {
  let reads = 0;
  const offer = await buildFreeTrialOffer(
    readersFor({
      readPriorFreeTrial: async () => {
        reads += 1;
        return null;
      },
    }),
    { contactId: null, trialDays: 90 }
  );
  assert.equal(reads, 0);
  assert.equal(offer.view.identified, false);
});

test("a threshold that the basket has not reached asks them to spend more", async () => {
  const offer = await buildFreeTrialOffer(readersFor({ readThresholdIncTax: async () => 1000 }), {
    contactId: 55,
    trialDays: 90,
    basketIncTax: 250,
  });
  assert.equal(offer.decision.granted, false);
  assert.equal(offer.view.kind, "earn");
  if (offer.view.kind === "earn") {
    assert.equal(offer.view.shortfallLabel, "$750.00");
    assert.equal(offer.view.thresholdLabel, "$1,000.00");
  }
});

test("a basket that clears the threshold is granted, but PENDING until it is an order", async () => {
  const offer = await buildFreeTrialOffer(readersFor({ readThresholdIncTax: async () => 1000 }), {
    contactId: 55,
    trialDays: 90,
    basketIncTax: 1200,
  });
  assert.equal(offer.decision.granted, true);
  assert.equal(offer.pending, true);
});

test("a real order that clears the threshold is granted and NOT pending", async () => {
  const offer = await buildFreeTrialOffer(
    readersFor({
      readThresholdIncTax: async () => 1000,
      readQualifyingOrder: async () => ({ order_id: 153235, total_inc_tax: 3262 }),
    }),
    { contactId: 55, trialDays: 90 }
  );
  assert.equal(offer.decision.granted, true);
  assert.equal(offer.pending, false);
});

test("a plan with no free period offers nothing to anybody", async () => {
  const offer = await buildFreeTrialOffer(readersFor(), { contactId: 55, trialDays: 0 });
  assert.equal(offer.decision.granted, false);
  assert.equal(offer.view.kind, "paid");
  assert.equal(offer.grantedDays, 0);
});
