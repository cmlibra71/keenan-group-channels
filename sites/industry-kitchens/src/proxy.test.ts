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
 */
const ALLOWED_PROXY_IMPORTS = new Set(["next/server", "@/lib/guard", "@/lib/acquisition-campaign"]);

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
  const attach = SOURCE.indexOf("attachCampaignCookie(req)");
  assert.ok(jsonBranch > 0 && renderBranch > 0, "the /json and /render branches are gone");
  assert.ok(attach > jsonBranch, "the campaign cookie runs before the /json branch");
  assert.ok(attach > renderBranch, "the campaign cookie runs before the /render branch");
});
