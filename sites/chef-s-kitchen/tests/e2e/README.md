# Chef's Depot — End-to-End Suite

A [cloakbrowser](../../../../../.claude/skills/cloakbrowser)-driven walk through **every
path** of the Chef's Depot storefront: register, log in/out, browse & search, cart → checkout,
quote (priced **and** price-on-application items), become a member, member pricing, account
management, draws, partner offers, and cancel. It produces a **markdown issues report** with
screenshots.

## What it needs

1. **The CD dev server running** on the base URL (default `http://localhost:3002`):
   ```bash
   npm run dev -w chef-s-kitchen -- --port 3002
   ```
2. **`E2E_LOGIN_SECRET`** set — for both the dev server *and* the test process (the suite uses
   the guarded `/api/test/login` bypass). Put it in `sites/chef-s-kitchen/.env`:
   ```
   E2E_LOGIN_SECRET=<openssl rand -hex 32>
   ```
   The bypass route returns **404 unless this is set**, and only ever logs in `@e2e.test`
   accounts (`E2E_EMAIL_DOMAIN`), so it is safe to ship everywhere.
3. The **cloakbrowser** global skill installed (it ships its own browser).

## Run it

```bash
# Full suite (writes tagged data to the configured commerce DB, then cleans up)
node sites/chef-s-kitchen/tests/e2e/run.mjs --base http://localhost:3002

# Read-only smoke pass — zero writes, safe against production
node sites/chef-s-kitchen/tests/e2e/run.mjs --smoke-only --base https://chefsdepot.com.au

# Flags
#   --headed   show the browser window
#   --keep     skip teardown (leave test data for debugging)
```

## Dev-server stability

`next dev` (webpack) compiles routes on demand and, under the suite's sustained load while
talking to the prod DB over Tailscale, can slow down or briefly crash mid-run (you'll see
`ERR_CONNECTION_REFUSED` / `HTTP 500` blips in the report — the suite retries transient
navigation errors, but a hard crash still surfaces). For the most reliable run:

- **Restart the dev server immediately before a full run** (a long-lived server degrades), or
- **Run against a production build** — `npm run build -w chef-s-kitchen && npm start -w chef-s-kitchen -- -p 3002` — which has no on-demand compilation and is far more stable. Set `E2E_LOGIN_SECRET` for that process too.

The first full run pays a one-time route-compile cost (the runner warms routes upfront).

## Output

`tests/e2e/artifacts/<runId>/report.md` (+ `report.json`) — leads with **Issues found**
(severity, route, expected vs actual, screenshot), then **Skipped/not-verified**, a full
**Coverage** table, and the **Teardown** audit. Screenshots for every step sit alongside.

Exit code is non-zero if any blocker/broken issue was recorded.

## Data safety

⚠️ The dev site's `COMMERCE_DATABASE_URL` points at the **production** commerce DB. The full
run therefore writes real rows — but every account it creates is tagged
`e2e-<runId>@e2e.test`, every created row is deleted in teardown (child→parent, by id and by
the test-email pattern), and a pre-run sweep clears anything a crashed run left behind. No real
money moves (dev forces Stripe test mode; the membership test card and bank-transfer checkout
charge nothing). Note that a placed test order may briefly decrement product inventory — it is
removed in teardown but stock adjustments are not reverted, so the suite uses quantity 1.

## How auth & payment are bypassed

| Concern | Mechanism |
| --- | --- |
| Login | `POST /api/test/login { secret, email }` → signs a session cookie (test emails only) |
| Membership | Staff test card `4065871315315604` (`MEMBERSHIP_TEST_CARD`) → membership with no Stripe charge |
| Checkout | `bank_transfer` / `net_terms` payment methods → order with no card charge (Stripe 4242 attempted only if it's the only method and a testMode gateway is configured) |

## Adding a flow

Drop `flows/NN-name.mjs` exporting `meta` + `run(ctx)`, then add it to the `FULL` array in
`run.mjs`. `ctx` gives you `page` (Playwright API), `base`, `report` (use `report.step(...)` /
`report.skip(...)`), `account`, `fixtures`, `secret`, and `isMember`.
