#!/usr/bin/env node
// ============================================================================
// Shared-module drift guard.
//
// The template/ -> sites/ relationship is "copy the files", which silently rots:
// a fix lands in template and never reaches the sites (this repo had three such
// stale-drift bugs at once — a checkout shipping-address fix, a missing store.ts
// export, and stale forked components). This check turns that silent drift into a
// loud failure for the files declared channel-agnostic in shared-modules.json.
//
// Exit 0 = every shared file matches template in every site.
// Exit 1 = at least one shared file drifted or is missing (drift listed).
//
// Usage: node orchestrator/check-shared-sync.mjs   (or: npm run sync:check)
// ============================================================================

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(ROOT, "orchestrator/shared-modules.json"), "utf8"));
const shared = manifest.files;

const sitesDir = join(ROOT, "sites");
const sites = existsSync(sitesDir)
  ? readdirSync(sitesDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : [];

const problems = [];

for (const site of sites) {
  for (const rel of shared) {
    const templatePath = join(ROOT, "template/src", rel);
    const sitePath = join(ROOT, "sites", site, "src", rel);
    if (!existsSync(templatePath)) {
      problems.push(`MISSING IN TEMPLATE: template/src/${rel} (listed in manifest)`);
      continue;
    }
    if (!existsSync(sitePath)) {
      problems.push(`MISSING IN SITE: sites/${site}/src/${rel}`);
      continue;
    }
    if (readFileSync(templatePath, "utf8") !== readFileSync(sitePath, "utf8")) {
      problems.push(`DRIFTED: sites/${site}/src/${rel} differs from template`);
    }
  }
}

if (problems.length) {
  console.error(`\n✖ Shared-module drift detected (${problems.length}):\n`);
  for (const p of problems) console.error("  " + p);
  console.error(
    `\nThese files are declared channel-agnostic in orchestrator/shared-modules.json` +
      ` and must stay identical to template/. Copy template/src/<path> to the drifted` +
      ` site(s), or — if the divergence is intentional and per-channel — remove the` +
      ` path from the manifest.\n`
  );
  process.exit(1);
}

console.log(
  `✓ ${shared.length} shared module(s) in sync across ${sites.length} site(s): ${sites.join(", ")}`
);
