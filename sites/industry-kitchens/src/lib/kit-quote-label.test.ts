import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (p: string) => readFileSync(path.join(here, "..", p), "utf8");

// Audit D20: the kit's Add to Quote words are template-node props, today's words when unset.
test("kit button words: node props when set, today's words otherwise", async () => {
  const { kitQuoteLabel } = await import("./kit-quote-label.ts");
  assert.equal(kitQuoteLabel(true, null), "Add to Quote");
  assert.equal(kitQuoteLabel(false, null), "Add to Quote — request pricing");
  assert.equal(kitQuoteLabel(false, { unpriced: "  Ask for a price  " }), "Ask for a price");
  assert.equal(kitQuoteLabel(true, { priced: "", unpriced: "x" }), "Add to Quote");
});

test("the product-kit native passes label_priced / label_unpriced through", () => {
  const natives = src("builder/product-natives.tsx");
  assert.match(natives, /label_priced/);
  assert.match(natives, /label_unpriced/);
});
