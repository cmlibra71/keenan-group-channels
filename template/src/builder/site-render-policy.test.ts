import test from "node:test";
import assert from "node:assert/strict";
import { siteRenderPolicy } from "./site-render-policy";

// Per-site (not shared): pins this site's rendering choices so a copy from
// another site cannot silently change them.
test("this site's form policy", () => {
  assert.deepEqual(siteRenderPolicy.formPolicy, { keepEmptyOptionValue: true, scopeFieldIds: true });
});

test("this site's function loading", () => {
  assert.equal(siteRenderPolicy.onlyUsedFunctions ?? false, true);
});

test("this site's builder stylesheet compile choices", () => {
  assert.deepEqual(siteRenderPolicy.builderCss ?? {}, { commaSafeSelectors: true });
});

test("this site's embeds, content date and responsive accordions", () => {
  assert.deepEqual(siteRenderPolicy.embedPolicy ?? {}, { calculator: true, canva: true, skope: true });
  assert.equal(siteRenderPolicy.contentNow ?? false, true);
  assert.equal(siteRenderPolicy.responsiveDetails ?? false, true);
});
