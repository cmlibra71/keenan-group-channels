import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { WELCOME_PRICING_OFF, WELCOME_PRICING_SCALE, welcomePricingTile } from "./welcome-copy";

/**
 * The "All Set" page every new member lands on (card gk23c1VK). It used to tell every
 * new member "Save up to 25% on products across the store." — a site-wide saving
 * percentage with no measured basis, in both states of the member price scale. Tim's
 * pack forbids any saving percentage until the spread is measured, "off retail", and
 * anything implying a new member saves on day one.
 */

const BANNED: Array<[string, RegExp]> = [
  ["a percentage", /%|per ?cent/i],
  ["a dollar figure", /\$/],
  ["'save up to'", /save up to/i],
  ["'off retail'", /off retail/i],
  ["'wholesale' (a member's floor is Wholesale + 1%, never Wholesale)", /wholesale/i],
];

for (const [state, tile] of [
  ["OFF", WELCOME_PRICING_OFF],
  ["ON", WELCOME_PRICING_SCALE],
] as const) {
  test(`the ${state} tile makes no saving claim`, () => {
    for (const text of [tile.title, tile.body]) {
      for (const [what, re] of BANNED) assert.doesNotMatch(text, re, `${state} tile carries ${what}: "${text}"`);
    }
  });
}

test("copy follows the switch: OFF is the cost-plus sentence, ON is Tim's directional line", () => {
  assert.equal(welcomePricingTile(false), WELCOME_PRICING_OFF);
  assert.equal(welcomePricingTile(true), WELCOME_PRICING_SCALE);
  assert.match(WELCOME_PRICING_SCALE.title, /Spend More, Save More/);
  // With the scale on, a member at $0 of spend pays the standard price: nothing may say
  // the member's prices already moved.
  assert.doesNotMatch(WELCOME_PRICING_SCALE.body, /reprice|from your first order|already/i);
  assert.match(WELCOME_PRICING_OFF.body, /automatically/);
});

/**
 * SOURCE GUARD — the page itself. A pure function nobody calls protects nothing: the
 * claim lived in the page's JSX, so the page must render THIS tile, read the channel's
 * own switch, and carry no hardcoded saving sentence of its own.
 */
test("the welcome page renders this tile off the channel switch, with no saving claim of its own", () => {
  const src = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
  const page = readFileSync(path.join(src, "app/membership/welcome/page.tsx"), "utf8");
  assert.match(page, /welcomePricingTile\(/, "page must render welcomePricingTile");
  assert.match(page, /getLadderConfig\(/, "page must read the channel's own scale switch");
  assert.doesNotMatch(page, /save up to/i);
  assert.doesNotMatch(page, /off retail/i);
  assert.doesNotMatch(page, /\d+\s*%/, "page carries a hardcoded percentage");
});
