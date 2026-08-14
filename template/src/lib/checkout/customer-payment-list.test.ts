import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Source guard: nothing in the storefront may read `enabledPaymentMethods`.
 *
 * `getCheckoutSettings()` returns the channel's payment methods in three lists and
 * only one of them belongs on a customer screen:
 *
 *  - `paymentMethods` — every configured method, enabled or not. The portal's
 *    settings editor and historical order lookups need the disabled ones.
 *  - `enabledPaymentMethods` — every enabled method, INCLUDING the ones the channel
 *    marks staff-only. A STAFF list: Industry Kitchens has Zoey's "Send Invoice"
 *    enabled precisely so staff can raise an order on it.
 *  - `customerPaymentMethods` — enabled minus channel staff-only. The only correct
 *    list on a storefront, because every storefront read is a CUSTOMER read.
 *
 * Reading the middle one is how IK's Send Invoice reached the checkout page and the
 * pay-a-quote screen (card NmAfwrdE). This is a source-level guard for the same
 * reason `customer-payment-surfaces.test.ts` is one: the failure is a NEW surface
 * reading the wrong property, which no unit test of an existing function can see.
 */

const SRC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
// This file, which necessarily names the property it forbids.
const EXEMPT = new Set(["customer-payment-list.test.ts"]);

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

test("no storefront surface reads the channel's enabled list instead of its customer list", () => {
  const offenders: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const lines = readFileSync(file, "utf8").split("\n");
    for (const [i, line] of lines.entries()) {
      // Prose about the property is fine — a read of it is not.
      const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
      if (code.includes("enabledPaymentMethods")) {
        offenders.push(`${path.relative(SRC, file)}:${i + 1}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `these storefront reads would offer a channel staff-only method to a customer: ${offenders.join(", ")}`
  );
});
