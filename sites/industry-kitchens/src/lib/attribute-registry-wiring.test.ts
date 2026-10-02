import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (p: string) => readFileSync(path.join(here, "..", p), "utf8");

// D18 sub-batch 2: a staff-added attribute filter's URL selection (f_<code>) must be read, so the
// category and brand routes parse selections with the storefront's resolved registry.
test("category and brand routes parse attribute selections with the channel's registry", () => {
  for (const p of ["app/categories/[slug]/page.tsx", "app/brands/[slug]/page.tsx"]) {
    assert.match(src(p), /parseAttributeSelections\(sp as Record<string, string \| undefined>, \(await loadCatalogAttributeContext\(ATTR_CHANNEL_ID\)\)\.attributes\)/);
  }
});
