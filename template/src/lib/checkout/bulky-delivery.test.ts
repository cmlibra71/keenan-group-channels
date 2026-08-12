import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateBulkyDelivery,
  deliveryWindowError,
  holdsPayment,
  isDeliveryService,
  SPECIALISED_HOLD_HEADING,
  SPECIALISED_HOLD_NOTICE,
  SPECIALISED_HOLD_PM,
} from "./bulky-delivery.ts";

test("a cart with no bulky items never has to answer", () => {
  assert.equal(validateBulkyDelivery({ hasBulkyItems: false, deliveryService: null }), null);
  assert.equal(
    validateBulkyDelivery({ hasBulkyItems: false, deliveryService: "nonsense" }),
    null
  );
});

test("a bulky cart must choose, and the choice must be one we offer", () => {
  assert.match(
    validateBulkyDelivery({ hasBulkyItems: true, deliveryService: null }) ?? "",
    /choose how the bulky items/i
  );
  assert.match(
    validateBulkyDelivery({ hasBulkyItems: true, deliveryService: "free_forklift" }) ?? "",
    /choose how the bulky items/i
  );
});

test("curbside needs nothing else", () => {
  assert.equal(validateBulkyDelivery({ hasBulkyItems: true, deliveryService: "curbside" }), null);
});

test("specialised needs the site type and a truck-access answer", () => {
  assert.match(
    validateBulkyDelivery({ hasBulkyItems: true, deliveryService: "specialised" }) ?? "",
    /what kind of site/i
  );
  assert.match(
    validateBulkyDelivery({
      hasBulkyItems: true,
      deliveryService: "specialised",
      siteAccess: { deliveryType: "Restaurant / cafe" },
    }) ?? "",
    /truck can reach/i
  );
  assert.equal(
    validateBulkyDelivery({
      hasBulkyItems: true,
      deliveryService: "specialised",
      siteAccess: { deliveryType: "Restaurant / cafe", truckAccessOk: false },
    }),
    null
  );
});

test("'no' is a real answer to truck access, not a missing one", () => {
  assert.equal(
    validateBulkyDelivery({
      hasBulkyItems: true,
      deliveryService: "specialised",
      siteAccess: { deliveryType: "Shopping centre", truckAccessOk: false },
    }),
    null
  );
});

test("the delivery window is optional but must be coherent", () => {
  assert.equal(deliveryWindowError(null, null), null);
  assert.equal(deliveryWindowError("", ""), null);
  assert.match(deliveryWindowError("07:00", "") ?? "", /both a start and an end/i);
  assert.match(deliveryWindowError("15:00", "09:00") ?? "", /after its start/i);
  assert.match(deliveryWindowError("7am", "3pm") ?? "", /look like 07:00/i);
  assert.equal(deliveryWindowError("07:00", "15:30"), null);
});

test("a bad window fails the whole specialised submission", () => {
  assert.match(
    validateBulkyDelivery({
      hasBulkyItems: true,
      deliveryService: "specialised",
      siteAccess: { deliveryType: "Warehouse", truckAccessOk: true, deliveryWindowStart: "09:00", deliveryWindowEnd: "08:00" },
    }) ?? "",
    /after its start/i
  );
});

test("only specialised holds the payment", () => {
  assert.equal(holdsPayment("specialised"), true);
  assert.equal(holdsPayment("curbside"), false);
  assert.equal(holdsPayment(null), false);
  assert.equal(isDeliveryService("curbside"), true);
  assert.equal(isDeliveryService("kerbside"), false);
});

// A held order is the one case where "Order Confirmed" is only half the story. The words the
// confirmation page and the confirmation email use come from HERE so they cannot drift apart —
// and so nobody can quietly delete the "nothing has been charged" half of the message.
test("the held-order copy says both things the customer needs: not charged, and delivery not in the total", () => {
  assert.match(SPECIALISED_HOLD_NOTICE, /nothing has been charged/i);
  assert.match(SPECIALISED_HOLD_NOTICE, /does not include delivery/i);
  assert.match(SPECIALISED_HOLD_NOTICE, /quote the delivery/i);
  assert.match(SPECIALISED_HOLD_HEADING, /nothing has been charged/i);
});

test("the held-order marker is not a real payment method", () => {
  assert.equal(SPECIALISED_HOLD_PM, "specialised_hold");
  assert.equal(["stripe", "bank_transfer", "net_terms"].includes(SPECIALISED_HOLD_PM), false);
});
