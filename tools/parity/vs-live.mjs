#!/usr/bin/env node
// ============================================================================
// Compare a page as it is NOW against a stored capture of how it looked BEFORE.
//
//   node tools/parity/vs-live.mjs <origin> <path…>
//
// parity.mjs answers "does the node version match the page it replaces" while
// both exist side by side. The moment you PUBLISH, that question stops being
// answerable — A and B both become the node version, and the run goes green
// whatever happened.
//
// So before publishing, keep the `.a.png` captures from the last pre-publish
// run (copy tools/parity/report to /tmp/prepub-report), and afterwards diff the
// live page against those. That is the only check that actually proves a
// conversion changed nothing, and it is what caught the Industry Kitchens
// homepage coming back 1,647px short.
// ============================================================================

import { withBrowser, shoot, VIEWPORTS } from "./capture.mjs";
import { compare } from "./compare.mjs";
import fs from "node:fs";

const origin = process.argv[2];
const paths = process.argv.slice(3);
if (!origin || paths.length === 0) {
  console.error("usage: node tools/parity/vs-live.mjs <origin> <path…>");
  process.exit(1);
}
const STORE = process.env.PARITY_BASELINE ?? "/tmp/prepub-report";
const slug = (p) => (p === "/" ? "home" : p.replace(/^\//, "").replace(/\//g, "-"));

let pass = 0;
let total = 0;
await withBrowser(async (browser) => {
  for (const p of paths) {
    for (const vp of VIEWPORTS) {
      const stored = `${STORE}/${slug(p)}-${vp.name}.a.png`;
      if (!fs.existsSync(stored)) {
        console.log(`  SKIP  ${p} [${vp.name}] — no baseline at ${stored}`);
        continue;
      }
      const now = `/tmp/vs-live-${slug(p)}-${vp.name}.png`;
      await shoot(browser, `${origin}${p}`, now, { viewport: vp });
      const r = await compare(stored, now, `/tmp/vs-live-${slug(p)}-${vp.name}.diff.png`);
      total++;
      const ok = !r.sizeMismatch && r.ratio <= 0.001;
      if (ok) pass++;
      console.log(
        `  ${ok ? "PASS" : "FAIL"}  ${p} [${vp.name}]  ${(r.ratio * 100).toFixed(4)}%` +
          (r.sizeMismatch ? "  SIZE MISMATCH" : "")
      );
    }
  }
});
console.log(`\n${pass}/${total} match the stored baseline`);
if (pass !== total) process.exit(1);
