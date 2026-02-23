#!/usr/bin/env node

/**
 * Scaffold a new storefront site from the template.
 *
 * Usage:
 *   node orchestrator/new-site.mjs <site-name> --channel-id=1 --domain=store.example.com
 *
 * This:
 * 1. Copies template/ into sites/<site-name>/
 * 2. Updates package.json with the site name
 * 3. Creates .env with the channel config
 * 4. Generates Caddy site config snippet
 * 5. Adds the site to docker-compose.yml (uses root Dockerfile.site)
 */

import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync, symlinkSync, existsSync } from "fs";
import { join, basename, resolve } from "path";
import { execSync } from "child_process";

const ROOT = new URL("..", import.meta.url).pathname;
const TEMPLATE_DIR = join(ROOT, "template");
const SITES_DIR = join(ROOT, "sites");
const CADDY_DIR = join(ROOT, "caddy");

// Parse args
const args = process.argv.slice(2);
const siteName = args[0];

if (!siteName) {
  console.error("Usage: node orchestrator/new-site.mjs <site-name> --channel-id=1 --domain=store.example.com");
  process.exit(1);
}

const flags = {};
for (const arg of args.slice(1)) {
  const [key, val] = arg.replace(/^--/, "").split("=");
  flags[key] = val;
}

const channelId = flags["channel-id"] || "1";
const domain = flags["domain"] || `${siteName}.localhost`;
const dbUrl = flags["db-url"] || process.env.COMMERCE_DATABASE_URL || "postgresql://keenan_portal_user:password@localhost:5432/commerce";
const port = flags["port"] || String(3001 + readdirSync(SITES_DIR).filter(f => {
  try { return statSync(join(SITES_DIR, f)).isDirectory(); } catch { return false; }
}).length);

const siteDir = join(SITES_DIR, siteName);

// 1. Copy template
console.log(`Creating site: ${siteName}`);
copyDirRecursive(TEMPLATE_DIR, siteDir, [
  "node_modules",
  ".next",
  ".env",
  ".env.local",
  "Dockerfile", // Sites use root Dockerfile.site, not a per-site Dockerfile
]);

// 2. Update package.json
const pkgPath = join(siteDir, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
pkg.name = siteName;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

// 3. Create .env
const envContent = `# Auto-generated for site: ${siteName}
COMMERCE_DATABASE_URL=${dbUrl}
CHANNEL_ID=${channelId}
SITE_URL=https://${domain}
`;
writeFileSync(join(siteDir, ".env"), envContent);

// 4. Symlink @keenan/services for local dev
const servicesRepo = resolve(ROOT, "..", "keenan-group-services");
if (existsSync(servicesRepo)) {
  const keenanDir = join(siteDir, "node_modules", "@keenan");
  mkdirSync(keenanDir, { recursive: true });
  const linkPath = join(keenanDir, "services");
  if (!existsSync(linkPath)) {
    symlinkSync(servicesRepo, linkPath);
    console.log(`  Linked @keenan/services -> ${servicesRepo}`);
  }
} else {
  console.log(`  Warning: keenan-group-services not found at ${servicesRepo}`);
  console.log(`  Run: npm install  (to install @keenan/services from registry)`);
}

// 5. Create site config (committed to repo - no secrets)
const siteConfig = { channelId, domain, port: Number(port) };
writeFileSync(join(siteDir, "site.config.json"), JSON.stringify(siteConfig, null, 2) + "\n");

// 6. Generate Caddy site config
// This snippet gets appended to the server's /etc/caddy/Caddyfile
mkdirSync(join(CADDY_DIR, "sites"), { recursive: true });
const caddyConf = `# Auto-generated for ${siteName} (channel ${channelId})
${domain} {
    reverse_proxy localhost:${port}
}
`;
writeFileSync(join(CADDY_DIR, "sites", `${siteName}.caddy`), caddyConf);

// 7. Update docker-compose
updateDockerCompose(siteName, channelId, dbUrl, port, domain);

console.log(`
Site created successfully!

  Directory:  sites/${siteName}/
  Channel:    ${channelId}
  Domain:     ${domain}
  Port:       ${port} (host) -> 3000 (container)
  Caddy:      caddy/sites/${siteName}.caddy

Next steps:
  1. npm install  (from repo root - installs all workspaces)
  2. Customize the site as needed
  3. docker compose up ${siteName} --build  (local testing)
  4. git add & push to main  (GitHub Actions deploys automatically)
`);

// ============================================================================
// Helpers
// ============================================================================

function copyDirRecursive(src, dest, exclude = []) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    if (exclude.includes(entry)) continue;
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    const stat = statSync(srcPath);
    if (stat.isDirectory()) {
      copyDirRecursive(srcPath, destPath, exclude);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

function updateDockerCompose(name, channelId, dbUrl, port, domain) {
  const composePath = join(ROOT, "docker-compose.yml");
  let compose;
  try {
    compose = readFileSync(composePath, "utf-8");
  } catch {
    compose = `version: "3.8"\n\nservices: {}\n`;
  }

  // Add the new service if not already present
  if (compose.includes(`  ${name}:`)) {
    console.log(`  Service ${name} already in docker-compose.yml`);
    return;
  }

  const serviceBlock = `  ${name}:
    build:
      context: .
      dockerfile: Dockerfile.site
      args:
        SITE_NAME: ${name}
        CHANNEL_ID: "${channelId}"
    ports:
      - "${port}:3000"
    environment:
      - COMMERCE_DATABASE_URL=${dbUrl}
      - CHANNEL_ID=${channelId}
      - SITE_URL=https://${domain}
    restart: unless-stopped`;

  // Replace empty services with the first service, or append
  if (compose.includes("services: {}")) {
    compose = compose.replace("services: {}", `services:\n${serviceBlock}`);
  } else {
    compose += `\n${serviceBlock}\n`;
  }

  writeFileSync(composePath, compose);
}
