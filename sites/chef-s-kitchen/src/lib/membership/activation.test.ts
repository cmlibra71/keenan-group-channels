import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatAddressLine,
  validateAccountStep,
  validateAddressStep,
} from "./activation";

const ok = {
  firstName: "Tim",
  lastName: "Keenan",
  phone: "0419032788",
  password: "Sup3rSecret!",
  confirmPassword: "Sup3rSecret!",
  hasPassword: false,
};

test("a good step 1 passes", () => {
  assert.equal(validateAccountStep(ok), null);
});

test("a contact who already has a password is sent to sign in, never allowed to set a new one", () => {
  const err = validateAccountStep({ ...ok, hasPassword: true });
  assert.match(err ?? "", /already have an account/i);
});

test("step 1 uses the SITE's password rule, not Myer's", () => {
  // "Password1" satisfies Myer's screenshot (8 chars, upper, lower, number) and fails ours,
  // which wants a special character. One rule on the site, and this is it.
  assert.ok(validateAccountStep({ ...ok, password: "Password1", confirmPassword: "Password1" }));
  assert.equal(validateAccountStep({ ...ok, password: "Passw0rd!", confirmPassword: "Passw0rd!" }), null);
});

test("step 1 wants a name and matching passwords", () => {
  assert.match(validateAccountStep({ ...ok, firstName: " " }) ?? "", /first and last name/i);
  assert.match(
    validateAccountStep({ ...ok, confirmPassword: "Something3lse!" }) ?? "",
    /do not match/i
  );
});

test("step 2 normalises an Australian address and refuses a junk one", () => {
  const good = validateAddressStep({
    address1: " 14 East Ct ",
    city: " Lilydale ",
    state: "Victoria",
    postalCode: "3140",
  });
  assert.deepEqual(good, {
    address: { address1: "14 East Ct", address2: "", city: "Lilydale", state: "VIC", postalCode: "3140" },
  });

  assert.match(
    (validateAddressStep({ address1: "14 East Ct", city: "Lilydale", state: "North Eastern Australia", postalCode: "3140" }) as { error: string }).error,
    /state or territory/i
  );
  assert.match(
    (validateAddressStep({ address1: "14 East Ct", city: "Lilydale", state: "VIC", postalCode: "31" }) as { error: string }).error,
    /4 digits/i
  );
  assert.match(
    (validateAddressStep({ address1: " ", city: "Lilydale", state: "VIC", postalCode: "3140" }) as { error: string }).error,
    /street address/i
  );
});

test("the address reads back as one line, the way the storyboard shows it", () => {
  assert.equal(
    formatAddressLine({ address1: "14 East Ct", address2: "", city: "LILYDALE", state: "VIC", postalCode: "3140" }),
    "14 East Ct, LILYDALE, VIC 3140"
  );
  assert.equal(formatAddressLine(null), "");
});
