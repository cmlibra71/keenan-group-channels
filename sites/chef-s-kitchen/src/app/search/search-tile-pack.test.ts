// ============================================================================
// Drift guard: a search-result tile states the carton exactly as the category tile does (O108e4jH).
//
// Category and brand tiles read the pack columns off Postgres rows; a search-result tile reads them
// off the Meilisearch HIT, which `fetchSearchChunk` maps field by field into a `SearchProduct`. That
// mapping once dropped them, so TOM-315-102 read "1 Carton = 2 Pcs" on its brand tile and nothing on
// its search tile while both Add to Cart buttons added a whole carton (independent review
// 2026-09-25). Read as SOURCE: the module pulls in `next/cache` and the store.
// ============================================================================
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tilePackLine } from "@keenan/services/pack";

const SRC = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "search-query.ts"),
  "utf8",
);
const FIELDS = ["sellPackSize", "sellPackUnit", "qtyPackagingEnabled", "qtyUnitLabel", "qtyIncrementGroups"];

test("the Meilisearch hit mapping carries every field tilePackLine reads", () => {
  const mapping = SRC.slice(SRC.indexOf("result.hits.map("), SRC.indexOf("total: result.estimatedTotalHits"));
  for (const f of FIELDS) assert.match(mapping, new RegExp(`${f}: hit\\.${f}`), `${f} is mapped from the hit`);
});

test("a hit shaped like the reindexed TOM-315-102 document reads the category tile's line", () => {
  const hit = { sellPackSize: 2, sellPackUnit: null, qtyPackagingEnabled: null, qtyUnitLabel: null, qtyIncrementGroups: null };
  assert.equal(tilePackLine(hit), "1 Carton = 2 Pcs");
  // A document indexed before the fields existed says nothing — a product sold individually.
  assert.equal(tilePackLine({}), "");
});
