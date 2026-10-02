import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const feed = readFileSync(path.join(here, "search-query.ts"), "utf8");
const route = readFileSync(path.join(here, "../api/search/route.ts"), "utf8");

// The shared index carries the PARENT brand; IK prints the Zoey sub-line label ("Waldorf Bold").
test("search results and suggestions overlay this storefront's brand display labels", () => {
  assert.match(feed, /await withBrandDisplayNames\(mapped\)/);
  assert.match(route, /await withBrandDisplayNames\(/);
  // the overlay runs BEFORE the public-field narrowing, so the label is what leaves the server
  assert.ok(route.indexOf("withBrandDisplayNames(") < route.indexOf("toPublicHit)"));
});
