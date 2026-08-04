// Parity check: does a page's node-tree version look identical to what's live?
//
//   node tools/parity/parity.mjs --origin https://chefsdepot.com.au /pages/contact
//   node tools/parity/parity.mjs --config tools/parity/pages.chefsdepot.json
//   node tools/parity/parity.mjs --origin https://x --self-check /            (A vs A)
//
// Writes tools/parity/report/<slug>-<viewport>.{a,b,diff}.png and a summary
// JSON, then prints a table. Exit code is 1 if any check fails, so it can gate
// a publish step.
//
// --self-check captures A twice instead of A/B. It answers "would this harness
// report zero if nothing changed?" — the question that decides whether any
// other number here means anything.

import { writeFile, mkdir } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { pairFor, shoot, withBrowser, VIEWPORTS } from "./capture.mjs";
import { compare } from "./compare.mjs";

const REPORT_DIR = "tools/parity/report";

function parseArgs(argv) {
  const args = { paths: [], origin: null, config: null, selfCheck: false, threshold: 0.001, viewports: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--origin") args.origin = argv[++i];
    else if (a === "--config") args.config = argv[++i];
    else if (a === "--self-check") args.selfCheck = true;
    else if (a === "--threshold") args.threshold = Number(argv[++i]);
    else if (a === "--viewport") args.viewports = [argv[++i]];
    else if (!a.startsWith("--")) args.paths.push(a);
  }
  return args;
}

const slugify = (p) =>
  (p === "/" ? "home" : p.replace(/^\/+|\/+$/g, "").replace(/[^a-zA-Z0-9]+/g, "-")) || "home";

async function main() {
  const args = parseArgs(process.argv.slice(2));

  /** @type {{origin:string, pages:{path:string, masks?:string[]}[]}} */
  let plan;
  if (args.config) {
    plan = JSON.parse(await readFile(args.config, "utf8"));
    if (args.origin) plan.origin = args.origin;
  } else {
    if (!args.origin || !args.paths.length) {
      console.error("usage: parity.mjs --origin <url> <path…>   |   --config <file>");
      process.exit(2);
    }
    plan = { origin: args.origin, pages: args.paths.map((path) => ({ path })) };
  }

  const viewports = args.viewports
    ? VIEWPORTS.filter((v) => args.viewports.includes(v.name))
    : VIEWPORTS;

  const results = [];
  await withBrowser(async (browser) => {
    for (const page of plan.pages) {
      const { a, b } = pairFor(plan.origin, page.path);
      const bUrl = args.selfCheck ? a : b;
      const slug = slugify(page.path);

      for (const viewport of viewports) {
        const base = `${REPORT_DIR}/${slug}-${viewport.name}`;
        const shotA = await shoot(browser, a, `${base}.a.png`, { viewport, masks: page.masks });
        const shotB = await shoot(browser, bUrl, `${base}.b.png`, { viewport, masks: page.masks });

        // A 404 on the /json twin means the node version isn't there at all —
        // report it as such rather than diffing an error page against content.
        if (shotB.status >= 400 || shotA.status >= 400) {
          results.push({
            path: page.path, viewport: viewport.name, pass: false,
            error: `HTTP ${shotA.status} (A) / ${shotB.status} (B)`,
            a: shotA.url, b: shotB.url,
          });
          continue;
        }

        const cmp = await compare(`${base}.a.png`, `${base}.b.png`, `${base}.diff.png`, {
          threshold: args.threshold,
        });
        results.push({
          path: page.path, viewport: viewport.name, ...cmp,
          a: shotA.url, b: shotB.url, diff: `${base}.diff.png`,
        });
      }
    }
  });

  await mkdir(REPORT_DIR, { recursive: true });
  const summary = {
    origin: plan.origin,
    mode: args.selfCheck ? "self-check (A vs A)" : "parity (A vs /json B)",
    threshold: args.threshold,
    ranAt: new Date().toISOString(),
    results,
  };
  await writeFile(`${REPORT_DIR}/summary.json`, JSON.stringify(summary, null, 2));

  console.log(`\n${summary.mode} · ${plan.origin} · threshold ${args.threshold * 100}%\n`);
  for (const r of results) {
    const status = r.pass ? "PASS" : "FAIL";
    const detail = r.error
      ? r.error
      : `${String(r.percent).padStart(8)}%  ${r.sizeMismatch ? `SIZE ${r.dimensions.a}→${r.dimensions.b}` : ""}`;
    console.log(`  ${status}  ${r.path} [${r.viewport}]  ${detail}`);
  }
  const failed = results.filter((r) => !r.pass);
  console.log(
    `\n${results.length - failed.length}/${results.length} passed. Images + summary in ${REPORT_DIR}/\n`
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
