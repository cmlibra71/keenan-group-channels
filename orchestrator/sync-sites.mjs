#!/usr/bin/env node

/**
 * Sync sites from the portal's commerce database.
 * Detects new channel/site combinations and scaffolds storefronts for them.
 *
 * Usage:
 *   node orchestrator/sync-sites.mjs
 *   node orchestrator/sync-sites.mjs --dry-run
 *
 * Requires COMMERCE_DATABASE_URL in environment.
 */

import { readdirSync, statSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import postgres from "postgres";

const ROOT = new URL("..", import.meta.url).pathname;
const SITES_DIR = join(ROOT, "sites");

const dryRun = process.argv.includes("--dry-run");
const dbUrl = process.env.COMMERCE_DATABASE_URL;

if (!dbUrl) {
  console.error("Error: COMMERCE_DATABASE_URL environment variable is required.");
  process.exit(1);
}

async function main() {
  const sql = postgres(dbUrl, { max: 1 });

  try {
    // Get all active channels with their primary sites
    const results = await sql`
      SELECT
        c.id as channel_id,
        c.name as channel_name,
        c.status as channel_status,
        s.url as site_url,
        s.site_name
      FROM channels c
      LEFT JOIN sites s ON s.channel_id = c.id AND s.is_primary = true
      WHERE c.status = 'active'
      ORDER BY c.id
    `;

    console.log(`Found ${results.length} active channel(s) in database.\n`);

    // Get existing site directories
    const existingSites = new Set();
    if (existsSync(SITES_DIR)) {
      for (const entry of readdirSync(SITES_DIR)) {
        if (statSync(join(SITES_DIR, entry)).isDirectory()) {
          existingSites.add(entry);
        }
      }
    }

    console.log(`Existing sites: ${existingSites.size > 0 ? [...existingSites].join(", ") : "(none)"}\n`);

    for (const row of results) {
      const siteName = slugify(row.channel_name);
      const domain = row.site_url
        ? new URL(row.site_url).hostname
        : `${siteName}.localhost`;

      if (existingSites.has(siteName)) {
        console.log(`  [exists] ${siteName} (channel ${row.channel_id})`);
        continue;
      }

      console.log(`  [new]    ${siteName} (channel ${row.channel_id}, domain: ${domain})`);

      if (!dryRun) {
        try {
          execSync(
            `node ${join(ROOT, "orchestrator/new-site.mjs")} ${siteName} --channel-id=${row.channel_id} --domain=${domain} --db-url="${dbUrl}"`,
            { stdio: "inherit" }
          );
        } catch (err) {
          console.error(`  Failed to create site ${siteName}:`, err.message);
        }
      }
    }

    if (dryRun) {
      console.log("\n(dry run - no changes made)");
    }
  } finally {
    await sql.end();
  }
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
