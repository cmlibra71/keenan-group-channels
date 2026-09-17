import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Two rules about the SHAPE of `proxy.ts`, both of which have already been broken once
 * (card T7Wclho8) and neither of which any other test can see.
 *
 * They are asserted against the source text rather than by calling `proxy()` because the
 * file imports through the `@/` alias, which this repo's node:test harness does not
 * resolve — and because both rules genuinely ARE about the file's shape: what it is
 * allowed to import, and what order its branches run in.
 */
const SOURCE = readFileSync(new URL("./proxy.ts", import.meta.url), "utf8");

/**
 * IMPORT DISCIPLINE — the middleware bundle is a closed list (the note at the top of
 * `lib/guard/index.ts`). Everything `proxy.ts` imports is bundled into
 * `.next/server/middleware.js` and paid for on EVERY request to the storefront, and a
 * breach only shows up at BUILD time, so this is the cheapest place to catch it.
 *
 * `@/lib/acquisition` is deliberately NOT on this list: it reads `next/headers`. The
 * pure half the proxy needs lives in `@/lib/acquisition-campaign`, which imports nothing.
 *
 * `@/lib/search-session` qualifies on the same terms (card LjdIfc92): it has ZERO imports —
 * a cookie name, a `crypto.randomUUID` call and two string helpers — so nothing new rides
 * into `middleware.js` behind it. The list stays CLOSED: a module joins it only by importing
 * nothing itself, and the register entry naming it is updated in the same change.
 */
const ALLOWED_PROXY_IMPORTS = new Set([
  "next/server",
  "@/lib/guard",
  "@/lib/acquisition-campaign",
  "@/lib/search-session",
]);

test("proxy.ts imports nothing that would drag the data layer into the middleware", () => {
  const imported = [...SOURCE.matchAll(/^import[\s\S]*?from\s+"([^"]+)";/gm)].map((m) => m[1]);
  assert.ok(imported.length >= 2, "no imports found — the regex is wrong, not the file");
  for (const spec of imported) {
    assert.ok(
      ALLOWED_PROXY_IMPORTS.has(spec),
      `proxy.ts imports ${spec}, which is not on the middleware allowlist`
    );
  }
});

/**
 * BRANCH ORDER — the `/json` and `/render` branches build their own responses, and
 * everything that makes those surfaces safe rides on them: the rewrite to the real
 * route, `x-kg-json` / `x-cms-render`, the `frame-ancestors` CSP locking the CMS preview
 * to the portal, and `X-Robots-Tag: noindex`.
 *
 * The campaign cookie used to run in FRONT of them and return a plain
 * `NextResponse.next()`, so a preview URL carrying a stray `utm_*` parameter lost every
 * one of those. Anything that only ADDS a header or a cookie belongs last.
 */
test("the campaign cookie is attached only after the /json and /render branches", () => {
  const jsonBranch = SOURCE.indexOf('pathname.startsWith("/json/")');
  const renderBranch = SOURCE.indexOf('pathname.startsWith("/render/")');
  // Matches the CALL wherever its argument list has grown — `attachCampaignCookie(req)` became
  // `attachCampaignCookie(req, session?.init)` on card LjdIfc92, and an `indexOf` of the old
  // literal would have returned -1 and failed open instead of asserting the ordering.
  const attach = SOURCE.search(/attachCampaignCookie\(req[,)]/);
  assert.ok(jsonBranch > 0 && renderBranch > 0, "the /json and /render branches are gone");
  assert.ok(attach > 0, "the attachCampaignCookie call is gone — the fall-through lost its cookie");
  assert.ok(attach > jsonBranch, "the campaign cookie runs before the /json branch");
  assert.ok(attach > renderBranch, "the campaign cookie runs before the /render branch");
});

/**
 * Same rule, the other thing the fall-through now does: `/search` mints the search-session id
 * (card LjdIfc92). It only ADDS a cookie, so it belongs at the bottom with the campaign one —
 * in front of `/json` or `/render` it would return a plain `NextResponse.next()` for a preview
 * URL under `/json/search` and strip the rewrite, the headers and the noindex.
 */
test("the search session is minted only after the /json and /render branches", () => {
  const jsonBranch = SOURCE.indexOf('pathname.startsWith("/json/")');
  const renderBranch = SOURCE.indexOf('pathname.startsWith("/render/")');
  const mint = SOURCE.search(/mintSearchSession\(req[,)]/);
  assert.ok(mint > 0, "the mintSearchSession call is gone");
  assert.ok(mint > jsonBranch, "the search session is minted before the /json branch");
  assert.ok(mint > renderBranch, "the search session is minted before the /render branch");
});

/**
 * The closed list is only worth anything while the modules ON it stay pure — the rule is
 * "which between them import nothing else", not "these three names are fine forever".
 * `lib/search-session.ts` is the newest entry and the easiest to grow an import, so it is
 * checked here rather than trusted to a comment.
 */
test("the search-session module the proxy imports still imports nothing itself", () => {
  const source = readFileSync(new URL("./lib/search-session.ts", import.meta.url), "utf8");
  const imported = [...source.matchAll(/^import[\s\S]*?from\s+"([^"]+)";/gm)].map((m) => m[1]);
  assert.deepEqual(
    imported,
    [],
    `lib/search-session.ts now imports ${imported.join(", ")} — that rides into middleware.js`
  );
});
