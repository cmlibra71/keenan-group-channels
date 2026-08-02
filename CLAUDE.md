# Keenan Group Channels

Multi-storefront system where each channel gets its own independent Next.js site.

## Local Development

### Prerequisites
- Node 22+
- `@keenan/services` installed from a **packed tarball** (`file:./keenan-services-1.0.0.tgz` in root package.json) — the committed tgz built from `../keenan-group-services`. This deliberately mirrors how prod (CI/Docker) and the portal consume services: a tarball has no nested `node_modules`, so `drizzle-orm`/`postgres`/`zod` resolve to the channels-root copies (single drizzle install — no dual-drizzle type clash). It is NOT a live symlink to the sibling repo.
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

Sites use `next dev --webpack` (not Turbopack) because Turbopack has issues resolving the `@keenan/services` package.

### Rebuilding @keenan/services

After making changes to `../keenan-group-services`, re-pack and re-link it with one command from the channels root:

```bash
npm run sync:services
```

This builds services, `npm pack`s it, copies the tgz to the channels root, and re-extracts it into `node_modules/@keenan/services` (replacing the previous copy). Then restart the dev servers to pick up changes. Commit the refreshed `keenan-services-1.0.0.tgz` when the services change is meant to ship — CI repacks it fresh from `services@main` at deploy time, so the committed tgz is just the bootstrap for `npm install` and local dev.

> Why a tarball instead of a `file:../` symlink: a symlink resolves into the services repo's **own** `node_modules`, which carries a second `drizzle-orm` install. TypeScript treats Drizzle's classes from two installs as nominally incompatible (TS2769, "separate declarations of a private property"), so passing Drizzle tables/operators across the boundary failed to compile. The tarball has no nested `node_modules`, so everything resolves to the single channels-root drizzle.

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

### Unit tests

Co-located `*.test.ts` files (`node:test` + `node:assert/strict`, imports carry an explicit
`.ts` extension) cover the pure logic seams in `src/lib/**` — password policy, session tokens,
Google claims, GST cookie, role permissions, checkout, Stripe gateways, cart pricing.

```bash
npm test                            # template + every site (this is what CI runs)
npm test -w template                # one workspace
npm test -w sites/chef-s-kitchen
```

These run in the **Typecheck** workflow on every push and PR. Note `sync:check` only catches
*divergence* between the template and site copies — a rule weakened identically in all three
passes it, so the tests are the only gate that objects. Test files are typechecked too
(they are no longer excluded from the tsconfigs).

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
  staff test card `MEMBERSHIP_TEST_CARD` (default `4242424242424242`, spaces/dashes ignored, no Stripe charge);
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
- Channel-agnostic shared logic (pure helpers, API routes, shared actions) must stay **byte-identical** to `template/` across every site. The set is declared in `orchestrator/shared-modules.json` and enforced by `npm run sync:check` (also a CI gate). Editing a shared file in `template/` means copying it to every site; the check tells you which drifted. Everything NOT in the manifest (design, layout, homepage, `store.ts` config, `blocks/registry.tsx`) is intentionally per-channel and free to diverge.
- Pure checkout/payment logic lives behind small seams under `template/src/lib/checkout/` (`order-draft`, `shipping`, `net-terms`) and `template/src/lib/payments/` (`gateway`, `stripe-gateways`), each with co-located `*.test.ts` run by `npm test`. `placeOrder` is a thin imperative shell over these; don't re-inline tax/shipping/gateway/net-terms logic at call sites.

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

After schema changes, re-link services into channels and restart:
```bash
npm run sync:services   # from the channels root — builds services, packs it, re-extracts the tgz
# Then restart dev servers
```

After deploying schema changes to production, grant permissions on new tables:
```bash
ssh keenan
docker exec postgres psql -U admin -d commerce -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO keenan_portal_user; GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO keenan_portal_user;"
```

## Deployment (blue-green, zero downtime)

**Full design + runbook: `../keenan-group-portal/docs/deployment-blue-green.md`**
(the portal repo owns the deploy system).

Pushing to `main` deploys each storefront **blue-green**: CI builds the image
(tagged `:latest` + `:<sha>`), then invokes `/home/ubuntu/deploy/deploy.sh`
(owned and shipped by the PORTAL repo) via SSM. The script starts the new build
on the site's idle port (industry-kitchens 3001/3011, chef-s-kitchen 3002/3012),
health-gates it on its direct port (`/api/health?deep=1` must report the pushed
sha), smoke-tests the home/product/category/cart pages, flips Caddy gracefully,
and drains the old container for 15 minutes with old-build requests (Next
`deploymentId` skew routing) still landing on it. The job FAILS loudly if the
new build never becomes healthy — traffic never moves.

- Never hand-edit `/etc/caddy/Caddyfile` — the portal's generator owns it.
- Rollback: `sudo /home/ubuntu/deploy/deploy.sh rollback <site>` on the host.
- **MIGRATION RULE:** old + new builds share Postgres during the drain window
  (and rollback needs one release of slack) — schema changes must be
  backward-compatible one release back: additive first, remove later.

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
| `scripts/cleanup-e2e-test-data.ts` | Purge `@e2e.test`-tagged test data (orders/quotes/subs/customers) created by manual QA or the E2E suite on a live env. **DRY RUN by default** — reports what would be deleted; pass `--apply` (or `CLEANUP_APPLY=true`) to delete. `--email-like=<pattern>` overrides the tag (must be test-scoped). |

### Adding new admin scripts

1. Create the script in `../keenan-group-services/scripts/`
2. Add it to the `options` list in `.github/workflows/admin-task.yml`
3. The script receives env vars: `COMMERCE_DATABASE_URL`, `MEILI_URL`, `MEILI_API_KEY`, `GOOGLE_API_KEY`

### Infrastructure reference

- **EC2 instance**: `i-07fb3cc6aeea2eb49` (Ubuntu, SSM-managed)
- **Docker network**: `app-network`
- **Containers**: `keenan-channel-{site}`, `keenan-group-portal`, `keenan-search` (Meilisearch), `postgres`
- **Reverse proxy**: Caddy (`/etc/caddy/Caddyfile`)
