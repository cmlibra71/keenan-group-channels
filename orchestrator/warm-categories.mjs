#!/usr/bin/env node
/**
 * Backfill the storefront category-listing caches: GET the base (unfiltered)
 * category page for every active category of every live site, so no real
 * visitor ever pays the cold faceted-query cost. Filter combinations warm on
 * demand; the 300s SWR window keeps every warmed entry serving instantly
 * thereafter (the cache dir is volume-mounted, so this survives deploys — a
 * backfill is only needed once, or after the cache volume is cleared).
 *
 * Usage:
 *   COMMERCE_DATABASE_URL=... node scripts/warm-categories.mjs
 *     [--url http://localhost:3100 --channel 1]   # override: warm one origin
 *     [--concurrency 4] [--limit N]               # N categories per site (testing)
 *
 * With no --url it warms every row of the `sites` table (channel_id + url).
 * Read-only against the DB; plain GETs against the sites.
 */
import postgres from "postgres";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const urlOverride = flag("url");
const channelOverride = flag("channel");
const concurrency = Number(flag("concurrency", 4));
const limit = Number(flag("limit", 0));

const dbUrl = process.env.COMMERCE_DATABASE_URL;
if (!dbUrl) {
  console.error("COMMERCE_DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(dbUrl, { max: 2 });

async function categorySlugs(channelId) {
  const rows = await sql`
    SELECT c.slug
    FROM categories c
    JOIN category_trees t ON t.id = c.tree_id
    WHERE t.channel_id = ${channelId} AND c.is_active = true AND c.slug IS NOT NULL
    ORDER BY c.depth NULLS FIRST, c.sort_order NULLS LAST, c.id`;
  return rows.map((r) => r.slug);
}

async function warmSite(origin, channelId) {
  const base = origin.replace(/\/$/, "");
  let slugs = await categorySlugs(channelId);
  if (limit > 0) slugs = slugs.slice(0, limit);
  console.log(`\n${base} (channel ${channelId}): warming ${slugs.length} categories…`);

  let ok = 0;
  let failed = 0;
  let totalMs = 0;
  let slowest = { slug: "", ms: 0 };
  const queue = [...slugs];
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (let slug = queue.shift(); slug !== undefined; slug = queue.shift()) {
        const t0 = Date.now();
        try {
          const res = await fetch(`${base}/categories/${encodeURIComponent(slug)}`, {
            redirect: "follow",
            signal: AbortSignal.timeout(60_000),
          });
          const ms = Date.now() - t0;
          totalMs += ms;
          if (ms > slowest.ms) slowest = { slug, ms };
          if (res.ok) ok++;
          else {
            failed++;
            // 404s are normal for categories with no page (redirects, hidden)
            if (res.status !== 404) console.warn(`  ${res.status} /categories/${slug} (${ms}ms)`);
          }
        } catch (e) {
          failed++;
          console.warn(`  FAIL /categories/${slug}: ${String(e).slice(0, 80)}`);
        }
      }
    })
  );
  const avg = ok + failed > 0 ? Math.round(totalMs / (ok + failed)) : 0;
  console.log(
    `  done: ${ok} warmed, ${failed} skipped/failed, avg ${avg}ms, slowest ${slowest.ms}ms (${slowest.slug})`
  );
}

try {
  if (urlOverride) {
    if (!channelOverride) throw new Error("--url requires --channel");
    await warmSite(urlOverride, Number(channelOverride));
  } else {
    const sites = await sql`SELECT channel_id, url FROM sites WHERE url IS NOT NULL ORDER BY channel_id`;
    if (sites.length === 0) console.log("No sites with a url — nothing to warm.");
    for (const site of sites) await warmSite(site.url, site.channel_id);
  }
} finally {
  await sql.end();
}
