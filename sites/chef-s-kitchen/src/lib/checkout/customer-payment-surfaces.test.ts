import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Every CUSTOMER-facing payment-method list must subtract the account's
 * staff-only methods, not just apply its allow-list (card N8kE8arY).
 *
 * This is a source-level guard because the failure it catches is not a wrong
 * result from a function — it is a NEW surface calling the right function with
 * the wrong number of arguments. It has already happened once: the checkout was
 * the only customer-facing payment-method surface when the staff-only flag was
 * built, and "pay a quote online" (card 0Wy0xHuq) added a second one that
 * offered staff-only methods to the customer until this test existed.
 *
 * `staffOnly` is an optional parameter so that non-customer callers stay
 * readable; that optionality is exactly what makes a silent omission possible,
 * so it is checked here instead.
 */

const SRC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
// The policy module itself defines the function and its tests exercise every
// arity deliberately.
const EXEMPT = new Set([
  "account-options-policy.ts",
  "account-options-policy.test.ts",
  // This file, which necessarily contains the call pattern it looks for.
  "customer-payment-surfaces.test.ts",
]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry) && !EXEMPT.has(entry)) out.push(full);
  }
  return out;
}

test("every customer-facing payment-method list subtracts the account's staff-only methods", () => {
  const offenders: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const src = readFileSync(file, "utf8");
    let from = 0;
    for (;;) {
      const at = src.indexOf("filterPaymentMethodsForAccount(", from);
      if (at === -1) break;
      from = at + 1;
      const end = src.indexOf(")", at);
      const call = src.slice(at, end === -1 ? src.length : end);
      if (!call.includes("staffOnlyPaymentMethods")) {
        offenders.push(path.relative(SRC, file));
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `these call sites offer a payment method to a customer without removing the account's staff-only methods: ${offenders.join(", ")}`
  );
});
