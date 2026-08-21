import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveStatementAccess,
  roleSeesAccountStatement,
  statementRefusalMessage,
} from "./statement-access";

test("Manager and Billing may read the statement; nobody else may", () => {
  assert.equal(roleSeesAccountStatement("Manager"), true);
  assert.equal(roleSeesAccountStatement("Billing"), true);
  assert.equal(roleSeesAccountStatement("billing"), true);
  assert.equal(roleSeesAccountStatement(" Manager "), true);
  assert.equal(roleSeesAccountStatement("Buyer"), false);
  assert.equal(roleSeesAccountStatement("Restricted Buyer"), false);
  assert.equal(roleSeesAccountStatement(null), false);
  assert.equal(roleSeesAccountStatement(""), false);
});

test("an individual shopper has no account statement, and is told why", () => {
  const a = resolveStatementAccess({ isB2B: false, accountId: null, roleName: null });
  assert.deepEqual(a, { visible: false, reason: "no-account" });
  assert.match(statementRefusalMessage("no-account"), /business accounts/);
});

test("a colleague without the role is refused and pointed somewhere", () => {
  const a = resolveStatementAccess({ isB2B: true, accountId: 7, roleName: "Buyer" });
  assert.deepEqual(a, { visible: false, reason: "role" });
  assert.match(statementRefusalMessage("role"), /manager and billing/i);
});

test("a failed role lookup fails CLOSED — this is somebody else's money", () => {
  const a = resolveStatementAccess({
    isB2B: true,
    accountId: 7,
    roleName: "Manager",
    lookupFailed: true,
  });
  assert.deepEqual(a, { visible: false, reason: "unavailable" });
});

test("a Billing contact on an account gets their statement", () => {
  assert.deepEqual(resolveStatementAccess({ isB2B: true, accountId: 42, roleName: "Billing" }), {
    visible: true,
    accountId: 42,
  });
});

test("B2B with no account id is refused rather than falling through to another account", () => {
  assert.deepEqual(resolveStatementAccess({ isB2B: true, accountId: null, roleName: "Manager" }), {
    visible: false,
    reason: "no-account",
  });
});
