#!/usr/bin/env node
// ============================================================================
// Seam scan — find drift between template/ and the sites.
//
// WHY THIS EXISTS, AND WHY IT WORKS THE WAY IT DOES.
//
// The first seam audit (docs/architecture/seam-audit.md) named a drift list by
// comparing files byte-for-byte and reading git last-touch dates. Every entry
// on that list turned out to be wrong:
//
//   - two "CD is behind template" account files differed ONLY in design tokens
//     (text-text-secondary vs text-zinc-500) — that is the seam working, not drift
//   - the rest differed only in JSX line-wrapping and extracted style constants
//   - WarrantyDirectory, called "CD behind by one commit" on last-touch dates,
//     is the opposite: CD has matchesBrand() and EntryCard, template does not.
//     Re-syncing as recommended would have DELETED working features.
//
// So this scan reports two numbers per file, and the second is the one that
// matters: raw differing lines, and differing lines after className values are
// normalised away and formatting is collapsed. A file with functional=0 is
// styled differently on purpose and must never be "re-synced".
//
// A non-zero functional count is a LEAD, not a finding: read the diff and
// decide which side is ahead. Direction cannot be inferred from a date.
//
// Usage:
//   node tools/seam/seam-scan.mjs                 # summary, functional drift only
//   node tools/seam/seam-scan.mjs --all           # include style-only divergence
//   node tools/seam/seam-scan.mjs --site chef-s-kitchen
//   node tools/seam/seam-scan.mjs --diff src/components/product/WarrantyDirectory.tsx
// ============================================================================

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const TEMPLATE = join(ROOT, "template");
const SITES_DIR = join(ROOT, "sites");

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const value = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : null;
};

const CODE = /\.(ts|tsx|js|jsx|css)$/;
const SKIP = new Set(["node_modules", ".next", "dist", "build", ".turbo"]);

function walk(dir, base = dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, base, out);
    else if (CODE.test(name)) out.push(relative(base, p));
  }
  return out;
}

/** Collapse everything that is legitimately per-site or purely cosmetic. */
function functionalForm(src) {
  return src
    .replace(/className="[^"]*"/g, 'className="~"')
    .replace(/className=\{[^}]*\}/g, 'className="~"')
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    // JSX attribute wrapping is a formatter choice, not a behaviour change:
    // collapsing to a token stream makes <button\n  onClick={x}\n> equal to
    // <button onClick={x}>.
    .join(" ")
    .replace(/\s+/g, " ")
    // Whitespace either side of a tag is a wrapping artefact: `Cancel </button>`
    // and `Cancel</button>` are the same rendered output.
    .replace(/\s*([<>])\s*/g, "$1")
    // A parenthesised JSX return is a formatter choice too.
    .replace(/&&\s*\(?\s*/g, "&&")
    .split(/(?<=[;{}>])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function rawLines(src) {
  return src.split("\n").map((l) => l.rstrip ?? l.replace(/\s+$/, ""));
}

/** Cheap LCS-free difference count — enough to rank, never used as a verdict. */
function differing(a, b) {
  const setB = new Map();
  for (const l of b) setB.set(l, (setB.get(l) ?? 0) + 1);
  let onlyA = 0;
  for (const l of a) {
    const n = setB.get(l) ?? 0;
    if (n > 0) setB.set(l, n - 1);
    else onlyA++;
  }
  let onlyB = 0;
  for (const n of setB.values()) onlyB += n;
  return onlyA + onlyB;
}

const only = value("--site");
const sites = readdirSync(SITES_DIR).filter(
  (s) => statSync(join(SITES_DIR, s)).isDirectory() && (!only || s === only)
);

const showDiff = value("--diff");
if (showDiff) {
  for (const site of sites) {
    const a = join(TEMPLATE, showDiff);
    const b = join(SITES_DIR, site, showDiff);
    if (!existsSync(a) || !existsSync(b)) continue;
    const fa = functionalForm(readFileSync(a, "utf8"));
    const fb = functionalForm(readFileSync(b, "utf8"));
    console.log(`\n=== ${site} · ${showDiff} ===`);
    console.log(`    functional difference: ${differing(fa, fb)} chunks`);
    const setA = new Set(fa);
    const setB = new Set(fb);
    for (const l of fa) if (!setB.has(l)) console.log("  TEMPLATE  " + l.slice(0, 140));
    for (const l of fb) if (!setA.has(l)) console.log("  SITE      " + l.slice(0, 140));
  }
  process.exit(0);
}

console.log("Seam scan — template/ vs sites/*\n");
console.log("  functional = differences that survive normalising away className");
console.log("  values, comments and JSX line-wrapping. functional 0 means the");
console.log("  file is styled differently ON PURPOSE — never 're-sync' it.\n");

for (const site of sites) {
  const siteSrc = join(SITES_DIR, site, "src");
  const files = walk(join(TEMPLATE, "src"));
  let identical = 0;
  const styleOnly = [];
  const functional = [];
  let siteOnly = 0;

  for (const f of files) {
    const tp = join(TEMPLATE, "src", f);
    const sp = join(siteSrc, f);
    if (!existsSync(sp)) {
      siteOnly++;
      continue;
    }
    const ts = readFileSync(tp, "utf8");
    const ss = readFileSync(sp, "utf8");
    if (ts === ss) {
      identical++;
      continue;
    }
    const fn = differing(functionalForm(ts), functionalForm(ss));
    const raw = differing(rawLines(ts), rawLines(ss));
    (fn === 0 ? styleOnly : functional).push({ f, fn, raw });
  }

  functional.sort((a, b) => b.fn - a.fn);
  console.log(`── ${site} ──`);
  console.log(
    `   ${identical} identical · ${styleOnly.length} style-only · ` +
      `${functional.length} with functional drift · ${siteOnly} absent from site`
  );
  for (const { f, fn, raw } of functional) {
    console.log(`   functional ${String(fn).padStart(4)}  (raw ${String(raw).padStart(4)})  ${f}`);
  }
  if (flag("--all") && styleOnly.length) {
    console.log("   — style-only (expected; do not re-sync) —");
    for (const { f, raw } of styleOnly) console.log(`   raw ${String(raw).padStart(4)}  ${f}`);
  }
  console.log("");
}

console.log("A non-zero functional count is a LEAD, not a finding. Read the diff");
console.log("(--diff <path>) and decide which side is ahead — a last-touch date");
console.log("cannot tell you, and got it backwards for WarrantyDirectory.");
