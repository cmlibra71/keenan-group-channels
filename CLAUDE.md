# Keenan Group Channels

Multi-storefront system where each channel gets its own independent Next.js site.

## Local Development

### Prerequisites
- Node 22+
- `@keenan/services` linked from `../keenan-group-services` (via `file:` dependency in root package.json)
- Access to the commerce PostgreSQL database

### Starting Dev Servers

From the workspace root:

```bash
# Industry Kitchens (Channel 1) on port 3001
npm run dev -w industry-kitchens -- --port 3001

# Chef's Depot (Channel 2) on port 3002
npm run dev -w chef-s-kitchen -- --port 3002

# Template site (for development)
npm run dev:template
```

Sites use `next dev --webpack` (not Turbopack) because Turbopack has issues resolving the symlinked `@keenan/services` package.

### Rebuilding @keenan/services

After making changes to `../keenan-group-services`:

```bash
cd ../keenan-group-services && npm run build
```

Then restart the dev servers to pick up changes.

## Testing & Browser Automation

**Browser automation tool: cloakbrowser** (a Playwright-API stealth Chromium, driven from
`node` via Bash — global Claude Code skill at `~/.claude/skills/cloakbrowser/`). Use it to
load, screenshot, fill, and verify pages — including auth-gated and Stripe/OAuth pages. Prefer
it over Playwright/Puppeteer here. Quick one-shots:

```bash
S=~/.claude/skills/cloakbrowser/scripts
node $S/cloak.mjs shot http://localhost:3002 --out /tmp/cd.png   # then Read the PNG
node $S/cloak.mjs eval http://localhost:3002 "document.title"
```

### Chef's Depot E2E suite

`sites/chef-s-kitchen/tests/e2e/` is a cloakbrowser-driven walk through every CD path
(register, login/out, browse/search, cart→checkout, quote incl. price-on-application,
become a member, member pricing, account mgmt, draws, partner offers, cancel). It emits a
markdown **issues report** with screenshots to `tests/e2e/artifacts/<runId>/report.md`.

```bash
# Start the dev server, then (with E2E_LOGIN_SECRET set in the CD .env):
node sites/chef-s-kitchen/tests/e2e/run.mjs --base http://localhost:3002
# Read-only smoke pass (zero writes — safe against prod):
node sites/chef-s-kitchen/tests/e2e/run.mjs --smoke-only --base https://chefsdepot.com.au
```

- **Test data:** the dev site writes the **production** commerce DB, so the suite tags every
  account `e2e-<runId>@e2e.test` and deletes everything it creates in teardown.
- **Bypasses:** guarded login route `POST /api/test/login` (gated on `E2E_LOGIN_SECRET`, test
  emails only — returns 404 when the secret is unset, so it is safe in every env); membership
  staff test card `MEMBERSHIP_TEST_CARD` (default `4065871315315604`, no Stripe charge);
  checkout via `bank_transfer`/`net_terms` (no card charge). See `tests/e2e/README.md`.

## Project Structure

- `template/` - Base Next.js template that new sites are scaffolded from
- `sites/` - Generated site instances (one per channel)
- `orchestrator/` - Scripts to scaffold new sites, generate nginx configs, update docker-compose
- `packages/` - Shared packages (currently empty; services come from `@keenan/services`)
- `caddy/` - Caddy reverse proxy config
- `Dockerfile.site` - Docker image for production site builds

## Key Conventions

- Each site has a `.env` with `CHANNEL_ID` and `COMMERCE_DATABASE_URL`
- Sites import everything from `@keenan/services` via `src/lib/store.ts`
- `store.ts` auto-initializes the DB connection and scopes all queries to `CHANNEL_ID`
- DB pool is kept small (5 connections) per site to avoid exhausting PostgreSQL
- New files created in `template/` must be copied to all sites in `sites/`

## Commerce Database Migrations

The commerce schema source of truth is `@keenan/services` (`../keenan-group-services/src/schema.ts`). All migrations are run from the services repo:

```bash
cd ../keenan-group-services

# Push schema changes directly to the database (development)
npm run db:push

# Generate migration SQL files
npm run db:generate

# Open Drizzle Studio to browse data
npm run db:studio
```

The services repo has its own `drizzle.config.ts` and `.env` with `COMMERCE_DATABASE_URL`. Do NOT run commerce migrations from the portal — use `@keenan/services` instead.

After schema changes, rebuild and restart:
```bash
cd ../keenan-group-services && npm run build
# Then restart dev servers
```

After deploying schema changes to production, grant permissions on new tables:
```bash
ssh keenan
docker exec postgres psql -U admin -d commerce -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO keenan_portal_user; GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO keenan_portal_user;"
```

## Admin Tasks (Backfills, Reindexing, etc.)

One-off admin scripts live in `../keenan-group-services/scripts/`. To run them in production, use the **Admin Task** workflow (`admin-task.yml`):

1. Go to **Actions → Admin Task → Run workflow**
2. Select the script (e.g. `scripts/backfill-meilisearch.ts`)
3. Set timeout if needed (default 600s)

The workflow builds a temporary Docker image from `@keenan/services` with the script, pushes to GHCR, then runs it on EC2 via SSM on the `app-network` (so it can reach Postgres, Meilisearch, etc.). The container is removed after execution.

### Available scripts

| Script | Purpose |
|--------|---------|
| `scripts/backfill-meilisearch.ts` | Reindex all products into Meilisearch (run after search config changes or data imports) |
| `scripts/backfill-embeddings.ts` | Generate vector embeddings for semantic search |
| `scripts/seed-cd-member-groups.ts` | Seed CD tier customer groups + `member_pricing_rules` (cost-plus) and wire the membership plan |
| `scripts/report-missing-cost-prices.ts` | Read-only: CD products with no cost price (no member price possible) |
| `scripts/validate-cost-plus-vs-zoey.ts` | Read-only: computed cost-plus vs legacy Zoey price lists match-rate report |
| `scripts/seed-cd-content-pages.ts` | Seed CD (ch2) `privacy`/`terms`/`warranty` content pages by mirroring IK's same-entity legal copy with brand/contact substitution (footer linked these but they 404'd). Supports `--dry`. |

### Adding new admin scripts

1. Create the script in `../keenan-group-services/scripts/`
2. Add it to the `options` list in `.github/workflows/admin-task.yml`
3. The script receives env vars: `COMMERCE_DATABASE_URL`, `MEILI_URL`, `MEILI_API_KEY`, `GOOGLE_API_KEY`

### Infrastructure reference

- **EC2 instance**: `i-07fb3cc6aeea2eb49` (Ubuntu, SSM-managed)
- **Docker network**: `app-network`
- **Containers**: `keenan-channel-{site}`, `keenan-group-portal`, `keenan-search` (Meilisearch), `postgres`
- **Reverse proxy**: Caddy (`/etc/caddy/Caddyfile`)
