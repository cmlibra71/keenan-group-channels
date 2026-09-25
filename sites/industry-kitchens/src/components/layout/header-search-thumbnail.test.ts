// ============================================================================
// Drift guard (card stH1U00j, second review): Industry Kitchens has TWO search
// dropdowns. The masthead on every page is components/layout/HeaderSearch.tsx;
// components/search/SearchTypeahead.tsx is mounted only inside /search. The
// first fix routed only SearchTypeahead through /api/image, so the dropdown
// shoppers actually use kept loading the raw S3 original — which the Zoey
// ingest overwrites in place — and a replaced photo stayed there for up to a
// year. This reads both components as SOURCE and fails if either renders a
// hit's thumbnail without searchThumbnailSrc().
// ============================================================================
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DROPDOWNS = [
  path.join(here, "HeaderSearch.tsx"),
  path.join(here, "..", "search", "SearchTypeahead.tsx"),
];

for (const file of DROPDOWNS) {
  test(`${path.basename(file)} loads search thumbnails through searchThumbnailSrc`, () => {
    const source = fs.readFileSync(file, "utf8");
    assert.match(source, /src=\{searchThumbnailSrc\(hit\.thumbnailUrl\)\}/);
    assert.doesNotMatch(source, /src=\{hit\.thumbnailUrl\}/);
  });
}
