import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * SOURCE GUARD: the signed-in quote page is the SECOND acceptance door, and it
 * must tell the buyer what the emailed copy tells them (card gk23c1VK,
 * blueprint AC 19 / AC 20a).
 *
 * `/account/quotes/[id]` carries its own Accept and its own Pay. For one round
 * this branch put the reprice notice on the portal's `/q/<uuid>` only, so the
 * same member, on the same quote, would have read "prices have moved, line by
 * line" on the emailed link and nothing on the website — and paid the moved
 * price silently on the screen that takes the money. Two of our own
 * customer-facing screens disagreeing about one record is the failure this
 * guard exists to catch, and no unit test of a pure function can see it.
 *
 * It also pins the two things the panel itself keeps getting wrong:
 *  - it is PRE-ACCEPTANCE (the comparison keeps moving after acceptance while
 *    the money owed does not, so an accepted quote must stop saying "Before you
 *    accept"), and the flag is required rather than optional;
 *  - customer money goes through the en-AU currency formatter, never a local
 *    `toFixed(2)` printing "$1449.25" above the Items list's "$1,449.25".
 *
 * Twin of the portal's `src/components/quotes/quote-reprice-notice.test.ts`.
 */
const SRC = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const NOTICE = path.join(SRC, "components/quote/QuoteRepriceNotice.tsx");
const QUOTE_PAGE = path.join(SRC, "app/account/quotes/[id]/page.tsx");

/** Comments name the banned pattern, so the guards read the CODE only. */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the account quote page shows the per-line movement before Accept and Pay", () => {
  // Raw, not comment-stripped: the Items block this notice must sit above is
  // marked by a JSX comment, and stripping it would delete the landmark.
  const page = readFileSync(QUOTE_PAGE, "utf8");

  const at = page.indexOf("<QuoteRepriceNotice");
  assert.notEqual(
    at,
    -1,
    "the signed-in quote page no longer surfaces the reprice delta — the storefront's own " +
      "Accept and Pay would take the moved price without telling the buyer (blueprint AC 19)"
  );
  const element = page.slice(at, page.indexOf("/>", at));
  assert.ok(element.includes("acceptanceOpen="), "the acceptance gate is not passed");
  assert.ok(
    element.includes('.kind !== "hidden"'),
    "the gate must be the same predicate the Accept button uses"
  );
  assert.ok(element.includes("currency="), "the quote's own currency is not passed");

  // The notice sits ABOVE the Items list, so the movement is read before the
  // prices it explains rather than after them.
  const itemsAt = page.indexOf("{/* Items */}");
  assert.notEqual(itemsAt, -1, "Items block not found — this guard needs rewriting");
  assert.ok(at < itemsAt, "the notice must render above the Items list, not below it");
});

test("the notice is pre-acceptance and formats money the way the page does", () => {
  const notice = stripComments(readFileSync(NOTICE, "utf8"));

  assert.ok(notice.includes("acceptanceOpen: boolean;"), "acceptanceOpen must be required");
  assert.ok(!notice.includes("acceptanceOpen?:"), "an optional gate is a gate a caller forgets");
  assert.ok(
    notice.replace(/\s+/g, " ").includes("if (!acceptanceOpen) return null;"),
    "an accepted, price-locked quote must stop rendering 'Before you accept'"
  );

  assert.ok(notice.includes('new Intl.NumberFormat("en-AU"'), "money must use the en-AU formatter");
  assert.ok(notice.includes('style: "currency"'), "money must be formatted as currency");
  assert.ok(!notice.includes("toFixed("), "toFixed drops the thousands separator on customer money");
});
