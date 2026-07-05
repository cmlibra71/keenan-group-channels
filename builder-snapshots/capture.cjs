// Phase-5 baseline capture: snapshot live CD pages (px + HTML, desktop+mobile)
// BEFORE any conversion — every converted page parity-gates against these.
// Usage: NODE_PATH=<playwright node_modules> node capture.cjs [outDir]
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const ORIGIN = "https://chefsdepot.com.au";
const OUT = process.argv[2] || __dirname;

async function discover(page) {
  // representative set: home + first N products/categories from the sitemap + statics
  const res = await page.goto(`${ORIGIN}/sitemap.xml`, { timeout: 60000 });
  const xml = await res.text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const products = urls.filter((u) => u.includes("/products/")).slice(0, 2);
  const categories = urls.filter((u) => u.includes("/categories/")).slice(0, 2);
  const pages = urls.filter((u) => u.includes("/pages/")).slice(0, 1);
  return ["/", ...products, ...categories, ...pages, "/cart"].map((u) =>
    u.startsWith("http") ? u.replace(ORIGIN, "") : u
  );
}

(async () => {
  const browser = await chromium.launch();
  const manifest = [];
  const page = await browser.newPage();
  const paths = await discover(page);
  await page.close();
  for (const p of paths) {
    const slug = p === "/" ? "home" : p.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "_").slice(0, 60);
    for (const [device, vw, vh] of [["desktop", 1280, 900], ["mobile", 375, 812]]) {
      const pg = await browser.newPage({ viewport: { width: vw, height: vh } });
      try {
        await pg.goto(ORIGIN + p, { waitUntil: "networkidle", timeout: 90000 });
        await pg.waitForTimeout(1500);
        await pg.screenshot({ path: path.join(OUT, `${slug}.${device}.png`), fullPage: true });
        if (device === "desktop") fs.writeFileSync(path.join(OUT, `${slug}.html`), await pg.content());
        manifest.push({ path: p, slug, device, ok: true });
        console.log(`✓ ${p} (${device})`);
      } catch (e) {
        manifest.push({ path: p, slug, device, ok: false, error: e.message });
        console.log(`✗ ${p} (${device}): ${e.message}`);
      }
      await pg.close();
    }
  }
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify({ origin: ORIGIN, captured: manifest }, null, 2));
  await browser.close();
  const fails = manifest.filter((m) => !m.ok).length;
  console.log(`done: ${manifest.length - fails}/${manifest.length} captures`);
  process.exit(fails ? 1 : 0);
})();
