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
