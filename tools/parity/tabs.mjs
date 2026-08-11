// Parity for content you have to CLICK to see.
//
//   node tools/parity/tabs.mjs capture <origin> <path…>          → baseline/
//   node tools/parity/tabs.mjs verify  <origin> <path…>          → compare vs baseline
//
// The page harness only ever sees a product page's FIRST tab, because that is
// all the DOM holds — the other four panels don't exist until a click. So an
// exploded tab strip could reproduce the description panel perfectly and get
// the reviews list, the downloads rows or the warranty directory wrong, and
// every check would stay green.
//
// This clicks each tab in turn and shoots the tab STRIP AND ITS PANEL, not the
// whole page: below the strip sits Related Products, whose rail is genuinely
// dynamic. Baselines are captured from the live page BEFORE a conversion ships
// and re-shot after, which is the only ordering that proves nothing moved —
// comparing the new thing against itself proves nothing at all.

import { readdir, mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { compare } from "./compare.mjs";

const BASE = "tools/parity/tabs";
const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
];

const FREEZE = `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}html{scroll-behavior:auto!important}`;

const slug = (p) => (p === "/" ? "home" : p.replace(/^\/+|\/+$/g, "").replace(/[^\w.-]+/g, "_"));

/** The tab strip is the element that holds the buttons; the panel is its next
 *  sibling. Both live inside the `mt-12 border-t` block the component roots at. */
async function tabsHandle(page) {
  return page.evaluate(() => {
    const bar = [...document.querySelectorAll("div")].find(
      (d) =>
        d.className.includes("border-b") &&
        d.className.includes("flex") &&
        d.querySelectorAll(":scope > button").length >= 3 &&
        /FEATURES|WARRANTY|Reviews/i.test(d.textContent || "")
    );
    if (!bar) return null;
    bar.parentElement.setAttribute("data-tabs-root", "1");
    return [...bar.querySelectorAll(":scope > button")].map((b) => b.textContent.trim());
  });
}

async function shootTabs(browser, url, dir, viewport) {
  const ctx = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  const shots = [];
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.addStyleTag({ content: FREEZE }).catch(() => {});
    await page.evaluate(() => document.fonts?.ready).catch(() => {});
    await page.waitForTimeout(2500);
    const labels = await tabsHandle(page);
    if (!labels) throw new Error(`no tab strip found at ${url}`);
    const root = page.locator("[data-tabs-root]").first();
    await root.scrollIntoViewIfNeeded();
    for (let i = 0; i < labels.length; i++) {
      // Buttons are re-created on every state change (active/inactive twins in
      // the authored version), so re-resolve by index each time.
      const btn = page.locator("[data-tabs-root] > div > button").nth(i);
      await btn.click({ timeout: 10_000 }).catch(() => {});
      await page.waitForTimeout(500);
      // The strip overflows its container at 390px, so the last tab sits partly
      // off-screen and the element shot is clipped by the VIEWPORT. Pin the
      // horizontal scroll before every capture: without it the clip lands a few
      // pixels differently depending on whether the clicked button survived the
      // click (live) or was swapped for its active twin (authored), and that
      // shows up as a diff in a strip whose geometry is provably identical.
      await page.evaluate(() => window.scrollTo(0, window.scrollY)).catch(() => {});
      const out = `${dir}/${viewport.name}-${i}.png`;
      await mkdir(dir, { recursive: true });
      await root.screenshot({ path: out }).catch(async () => {
        await page.screenshot({ path: out, fullPage: true });
      });
      shots.push({ index: i, label: labels[i], out });
    }
    return shots;
  } finally {
    await ctx.close();
  }
}

const [mode, origin, ...paths] = process.argv.slice(2);
if (!mode || !origin || !paths.length) {
  console.error("usage: tabs.mjs capture|verify <origin> <path…>");
  process.exit(2);
}
const dirFor = (p, kind) => `${BASE}/${kind}/${slug(p)}`;

const browser = await chromium.launch({ headless: true });
let failures = 0;
try {
  for (const path of paths) {
    for (const vp of VIEWPORTS) {
      const url = `${origin}${path.startsWith("/") ? path : `/${path}`}`;
      if (mode === "capture") {
        const shots = await shootTabs(browser, url, dirFor(path, "baseline"), vp);
        console.log(`  captured ${shots.length} panels  ${slug(path)} [${vp.name}]  ${shots.map((s) => s.label).join(" | ")}`);
      } else {
        const shots = await shootTabs(browser, url, dirFor(path, "after"), vp);
        const baseDir = dirFor(path, "baseline");
        const have = new Set(await readdir(baseDir).catch(() => []));
        for (const s of shots) {
          const name = `${vp.name}-${s.index}.png`;
          if (!have.has(name)) {
            console.log(`  SKIP  ${slug(path)} [${vp.name}] ${s.label} — no baseline`);
            continue;
          }
          const r = await compare(`${baseDir}/${name}`, s.out, `${BASE}/diff/${slug(path)}-${name}`);
          const pct = r.percent;
          const ok = !r.sizeMismatch && pct <= 0.1;
          if (!ok) failures++;
          console.log(
            `  ${ok ? "PASS" : "FAIL"}  ${slug(path)} [${vp.name}] ${s.label}  ${pct.toFixed(4)}%${
              r.sizeMismatch ? `  SIZE ${r.dimensions.a.join("x")} vs ${r.dimensions.b.join("x")}` : ""
            }`
          );
        }
      }
    }
  }
} finally {
  await browser.close();
}
if (mode === "verify") console.log(failures ? `\n${failures} panel(s) differ` : "\nall panels match their baseline");
process.exit(failures ? 1 : 0);
