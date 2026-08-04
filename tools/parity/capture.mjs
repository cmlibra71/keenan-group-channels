// Capture a page twice — as published, and as its node-tree twin — for pixel
// comparison.
//
// The `/json/*` surface exists for exactly this: proxy.ts rewrites /json/<path>
// onto the real route with `x-kg-json: 1`, forcing the node branch and the
// DRAFT tree, and stamps noindex. So A and B come from the same server, the
// same data and the same session — the only intended difference is which
// renderer drew the page.
//
//   A = https://site/pages/contact        (published — blocks today)
//   B = https://site/json/pages/contact   (node tree, draft)
//
// Everything here exists to remove differences that are NOT the renderer's
// doing. A screenshot comparison that flaps is worse than none, because people
// learn to wave it through.

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

/** Widths worth checking: phone, tablet, desktop. */
export const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "desktop", width: 1440, height: 900 },
];

/** Kill anything that makes two loads of the same page differ by itself. */
const FREEZE_CSS = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    animation-play-state: paused !important;
    caret-color: transparent !important;
  }
  html { scroll-behavior: auto !important; }
  /* Video posters vary by decode timing; blank them rather than diff noise. */
  video { visibility: hidden !important; }
`;

/**
 * Settle a page: fonts loaded, lazy images triggered, nothing animating.
 * Without the scroll pass, below-the-fold images are still placeholders and
 * every long page reports a difference that isn't real.
 */
async function settle(page, { settleMs = 600 } = {}) {
  await page.addStyleTag({ content: FREEZE_CSS }).catch(() => {});
  await page.evaluate(async () => {
    // @ts-ignore - document.fonts is standard in the browser
    if (document.fonts?.ready) await document.fonts.ready;
  }).catch(() => {});

  await page.evaluate(async () => {
    const step = Math.floor(window.innerHeight * 0.8);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  }).catch(() => {});

  await page
    .waitForLoadState("networkidle", { timeout: 15_000 })
    .catch(() => {}); // a live site with polling never idles; don't fail on it
  await page.waitForTimeout(settleMs);
}

/**
 * Paint over regions that legitimately differ between two loads (rotating
 * carousels, stock counts, "N people viewing", timestamps).
 *
 * Masks are declared PER PAGE, never globally — a global mask is how a harness
 * quietly stops testing the thing you care about.
 */
async function applyMasks(page, masks = []) {
  if (!masks.length) return;
  await page.evaluate((selectors) => {
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        const node = el;
        node.style.setProperty("background", "#FF00FF", "important");
        node.style.setProperty("color", "transparent", "important");
        node.style.setProperty("border-color", "#FF00FF", "important");
        for (const child of node.querySelectorAll("*")) {
          child.style.setProperty("visibility", "hidden", "important");
        }
      }
    }
  }, masks);
}

/** Screenshot one URL, fully settled, at one viewport. */
export async function shoot(browser, url, out, { viewport, masks = [], profileCookies = [] }) {
  const ctx = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  if (profileCookies.length) await ctx.addCookies(profileCookies);
  const page = await ctx.newPage();
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    const status = res?.status() ?? 0;
    await settle(page);
    await applyMasks(page, masks);
    await mkdir(dirname(out), { recursive: true });
    await page.screenshot({ path: out, fullPage: true });
    return { url, status, out };
  } finally {
    await ctx.close();
  }
}

/** The A/B pair for one path: published vs its /json twin. */
export function pairFor(origin, path) {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return {
    a: `${origin}${clean}`,
    b: `${origin}/json${clean === "/" ? "" : clean}`,
  };
}

export async function withBrowser(fn) {
  const browser = await chromium.launch({ headless: true });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}
