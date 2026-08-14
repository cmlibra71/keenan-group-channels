import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newlyAddedPeople,
  normalisePeople,
  personName,
  validatePeople,
  type AccountPerson,
} from "./account-people.ts";

const ROLES = [
  { id: 6, name: "Manager" },
  { id: 3, name: "Billing" },
];

function person(over: Partial<AccountPerson> = {}): AccountPerson {
  return {
    firstName: "Jo",
    lastName: "Smith",
    email: "jo@example.com",
    phone: "",
    roleId: 6,
    roleName: "Manager",
    receivesEmails: false,
    ...over,
  };
}

test("the old free-text shape still reads: one name splits, junk role is dropped", () => {
  // Exactly what production holds today (Steve's screenshot).
  const rows = normalisePeople(
    [{ name: "Timothy Keenan", email: "tim@example.com", phone: "0419032785", role: "Dishwasher" }],
    ROLES
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].firstName, "Timothy");
  assert.equal(rows[0].lastName, "Keenan");
  assert.equal(rows[0].roleId, null);
  // Kept visible so nothing the customer typed silently disappears.
  assert.equal(rows[0].roleName, "Dishwasher");
});

test("an old row whose free-text role happens to be a real role is matched to it", () => {
  const rows = normalisePeople([{ name: "Pat Jones", role: "billing" }], ROLES);
  assert.equal(rows[0].roleId, 3);
  assert.equal(rows[0].roleName, "Billing");
});

test("blank rows are dropped, not stored", () => {
  assert.deepEqual(normalisePeople([{ name: "  " }, {}, null, "x"], ROLES), []);
});

test("validation demands both names, a real role, and an email to email", () => {
  assert.match(validatePeople([person({ lastName: "" })], ROLES) ?? "", /first and last name/);
  assert.match(validatePeople([person({ roleId: null })], ROLES) ?? "", /Choose a role for Jo Smith/);
  assert.match(validatePeople([person({ roleId: 999 })], ROLES) ?? "", /Choose a role/);
  assert.match(validatePeople([person({ email: "nope" })], ROLES) ?? "", /valid email/);
  assert.match(
    validatePeople([person({ email: "", receivesEmails: true })], ROLES) ?? "",
    /needs an email address/
  );
  assert.equal(validatePeople([person()], ROLES), null);
});

test("only genuinely new people, and role changes, notify the manager", () => {
  const before = [person(), person({ firstName: "Sam", lastName: "Lee", email: "sam@example.com", roleId: 3, roleName: "Billing" })];

  // Editing a phone number is not an addition.
  const phoneEdited = newlyAddedPeople(before, [
    person({ phone: "0400 000 000" }),
    before[1],
  ]);
  assert.deepEqual(phoneEdited, []);

  // A new person is.
  const added = newlyAddedPeople(before, [
    ...before,
    person({ firstName: "Kim", lastName: "Ng", email: "kim@example.com" }),
  ]);
  assert.deepEqual(added.map(personName), ["Kim Ng"]);

  // So is handing someone a different level of access.
  const promoted = newlyAddedPeople(before, [
    before[0],
    { ...before[1], roleId: 6, roleName: "Manager" },
  ]);
  assert.deepEqual(promoted.map(personName), ["Sam Lee"]);

  // Removing someone notifies nobody.
  assert.deepEqual(newlyAddedPeople(before, [before[0]]), []);
});

test("people with no email are told apart by name", () => {
  const before = [person({ email: "" })];
  assert.deepEqual(newlyAddedPeople(before, [person({ email: "", phone: "0400" })]), []);
  assert.deepEqual(
    newlyAddedPeople(before, [person({ email: "" }), person({ firstName: "Ada", email: "" })]).map(
      personName
    ),
    ["Ada Smith"]
  );
});
