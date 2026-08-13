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
 * `staffOnly` is now a REQUIRED parameter of both entry points, so a two-argument
 * call no longer compiles. That closes the arity trap but not the whole hole: a
 * caller can still pass a literal `null` and look deliberate while offering a
 * staff-only method. So this guard reads the ARGUMENT, not the arity — every call
 * to either entry point outside the policy module must either name
 * `staffOnlyPaymentMethods` (customer surfaces) or pass null with the word
 * "staff" in a comment beside it, so a staff caller opts out in writing.
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

// Both halves of the seam: the list a surface RENDERS from, and the predicate it
// AUTHORIZES with. Guarding only the first let an authorization-only call site
// (which is all a "pay this invoice" screen needs) walk straight past.
const ENTRY_POINTS = ["filterPaymentMethodsForAccount(", "isPaymentMethodAllowed("];

// A staff caller opts out in writing: null followed by a comment containing
// "staff" — see the header. Written as a regex so the comment style is the seam.
const STAFF_OPT_OUT = /null\s*\/\*\s*staff/i;

test("every customer-facing payment-method list subtracts the account's staff-only methods", () => {
  const offenders: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const src = readFileSync(file, "utf8");
    for (const entry of ENTRY_POINTS) {
      let from = 0;
      for (;;) {
        const at = src.indexOf(entry, from);
        if (at === -1) break;
        from = at + 1;
        const end = src.indexOf(")", at);
        const call = src.slice(at, end === -1 ? src.length : end);
        if (!call.includes("staffOnlyPaymentMethods") && !STAFF_OPT_OUT.test(call)) {
          offenders.push(`${path.relative(SRC, file)} (${entry.slice(0, -1)})`);
        }
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `these call sites offer a payment method to a customer without removing the account's staff-only methods: ${offenders.join(", ")}`
  );
});
