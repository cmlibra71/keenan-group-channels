import test from "node:test";
import assert from "node:assert/strict";
import {
  missingProfileDetails,
  profileIsComplete,
  profilePromptLines,
} from "./profile-completeness";

const addr = (billing: boolean, shipping: boolean) => ({
  isDefaultBilling: billing,
  isDefaultShipping: shipping,
});

test("a customer with a phone and one address doing both jobs is complete", () => {
  const input = { phone: "0412 345 678", addresses: [addr(true, true)] };
  assert.deepEqual(missingProfileDetails(input), []);
  assert.equal(profileIsComplete(input), true);
});

test("two addresses covering one default each is complete", () => {
  const input = { phone: "03 9000 0000", addresses: [addr(true, false), addr(false, true)] };
  assert.deepEqual(missingProfileDetails(input), []);
});

test("no addresses asks for an address, never for two default ticks", () => {
  assert.deepEqual(missingProfileDetails({ phone: "0412 345 678", addresses: [] }), ["address"]);
});

test("addresses with no default billing asks only for billing", () => {
  assert.deepEqual(
    missingProfileDetails({ phone: "0412 345 678", addresses: [addr(false, true)] }),
    ["defaultBilling"]
  );
});

test("addresses with no default shipping asks only for shipping", () => {
  assert.deepEqual(
    missingProfileDetails({ phone: "0412 345 678", addresses: [addr(true, false)] }),
    ["defaultShipping"]
  );
});

test("an address that is neither default asks for both", () => {
  assert.deepEqual(
    missingProfileDetails({ phone: "0412 345 678", addresses: [addr(false, false)] }),
    ["defaultBilling", "defaultShipping"]
  );
});

test("a missing, empty or whitespace phone is missing; phone comes first", () => {
  for (const phone of [null, undefined, "", "   "]) {
    assert.deepEqual(missingProfileDetails({ phone, addresses: [] }), ["phone", "address"]);
  }
});

test("every outstanding item gets a sentence and every sentence is non-empty", () => {
  const lines = profilePromptLines(
    missingProfileDetails({ phone: "", addresses: [addr(false, false)] })
  );
  assert.equal(lines.length, 3);
  for (const l of lines) assert.ok(l.trim().length > 0);
});

test("the wording names the controls the customer has to use", () => {
  const [billing] = profilePromptLines(["defaultBilling"]);
  const [shipping] = profilePromptLines(["defaultShipping"]);
  assert.match(billing, /Set as default billing/);
  assert.match(shipping, /Set as default shipping/);
});

test("nothing in the prompt claims an order is blocked", () => {
  const all = profilePromptLines(["phone", "address", "defaultBilling", "defaultShipping"]);
  for (const line of all) {
    assert.doesNotMatch(line, /can(not|'t)|blocked|required|must/i);
  }
});

// ── The prompt never asks for a control the customer's role has taken away ──
// (card H5JdsMrC landing on card xqWftDcL's rule: every prompt line names the
// CONTROL that satisfies it.)

test("a customer refused the address book is not told to add an address", () => {
  const missing = missingProfileDetails({
    phone: "0400 000 000",
    addresses: [],
    canAddAddress: false,
    canEditAddress: false,
  });
  assert.deepEqual(missing, []);
});

test("the phone item survives an address refusal — they can still fix that", () => {
  const missing = missingProfileDetails({
    phone: "",
    addresses: [],
    canAddAddress: false,
    canEditAddress: false,
  });
  assert.deepEqual(missing, ["phone"]);
});

test("a customer who may not EDIT is not told to set a default on a saved address", () => {
  const missing = missingProfileDetails({
    phone: "0400 000 000",
    addresses: [addr(false, false)],
    canAddAddress: false,
    canEditAddress: false,
  });
  assert.deepEqual(missing, []);
});

test("the flags default to true, so B2C and role-unaware callers are unchanged", () => {
  assert.deepEqual(missingProfileDetails({ phone: "0400 000 000", addresses: [] }), ["address"]);
  assert.deepEqual(
    missingProfileDetails({ phone: "0400 000 000", addresses: [addr(false, false)] }),
    ["defaultBilling", "defaultShipping"]
  );
});

test("a customer who may still ADD is asked for the address they can actually add", () => {
  const missing = missingProfileDetails({
    phone: "0400 000 000",
    addresses: [],
    canAddAddress: true,
    canEditAddress: false,
  });
  assert.deepEqual(missing, ["address"]);
});
