#!/usr/bin/env node
// Chef's Depot end-to-end suite.
//
//   node tests/e2e/run.mjs --base http://localhost:3002
//   node tests/e2e/run.mjs --smoke-only --base https://chefsdepot.com.au
//
// Full mode requires the dev server running AND E2E_LOGIN_SECRET exported for
// that server (and visible to this process). It registers, checks out, becomes a
// member, etc. against the configured commerce DB using uniquely-tagged data,
// then deletes everything it created. --smoke-only does zero writes.
import { join } from "node:path";
import {
  loadSiteEnv,
  parseArgs,
  Report,
  ensureDir,
  warmUp,
  E2E_ROOT,
} from "./lib/harness.mjs";
import { open } from "./lib/cloak.mjs";
import { discoverFixtures } from "./lib/site.mjs";
import { writeReport } from "./lib/render.mjs";
import { purgeTestData, countTestCustomers, closeSql } from "./lib/db.mjs";

import * as smoke from "./flows/00-smoke.mjs";
import * as register from "./flows/01-register.mjs";
import * as auth from "./flows/02-login-logout.mjs";
import * as browse from "./flows/03-browse-search.mjs";
import * as checkout from "./flows/04-cart-checkout.mjs";
import * as quote from "./flows/05-quote.mjs";
import * as membership from "./flows/06-membership.mjs";
import * as memberPricing from "./flows/07-member-pricing.mjs";
import * as account from "./flows/08-account.mjs";
import * as memberExtras from "./flows/09-member-extras.mjs";
import * as orderScoping from "./flows/10-order-scoping.mjs";
import * as realStripe from "./flows/11-real-stripe.mjs";

loadSiteEnv();
const args = parseArgs(process.argv.slice(2));
const startedAt = new Date();
const runId = String(startedAt.getTime());
const emailDomain = (process.env.E2E_EMAIL_DOMAIN || "e2e.test").toLowerCase();
const secret = process.env.E2E_LOGIN_SECRET || "";
const testCard = process.env.MEMBERSHIP_TEST_CARD || "4065871315315604";
const emailLike = `e2e-%@${emailDomain}`;

const account_ = {
  email: `e2e-${runId}@${emailDomain}`,
  password: "Test1234!aA",
  firstName: "E2E",
  lastName: `R${runId}`,
  company: "E2E Test Co",
};

if (!args.smokeOnly && !secret) {
  console.error(
    "✖ E2E_LOGIN_SECRET is not set. The full suite needs it (and the dev server must\n" +
      "  share the same value) to use the login bypass. Either export it, or run with\n" +
      "  --smoke-only for a read-only pass."
  );
  process.exit(2);
}

const artifactsDir = ensureDir(join(E2E_ROOT, "artifacts", runId));
const report = new Report({ runId, base: args.base, artifactsDir });

const FULL = [register, auth, browse, checkout, quote, membership, memberPricing, account, memberExtras, orderScoping, realStripe];
const FLOWS = args.smokeOnly ? [smoke] : [smoke, ...FULL];

console.log(`\nChef's Depot E2E — run ${runId}`);
console.log(`Base: ${args.base}  |  Mode: ${args.smokeOnly ? "smoke-only (read-only)" : "full"}`);
console.log(`Artifacts: ${artifactsDir}\n`);

let exitCode = 0;
let bctx, page;

try {
  ({ ctx: bctx, page } = await open({ profile: "cd-e2e", headless: !args.headed }));
  report.setPage(page);
  await bctx.clearCookies().catch(() => {});

  // Pre-run sweep — clear data stranded by a crashed prior run.
  if (!args.smokeOnly) {
    try {
      const swept = await purgeTestData({ emailLike });
      if (swept.customers_matched) console.log(`Pre-run sweep removed ${swept.customers_matched} stale test customer(s).`);
    } catch (err) {
      console.warn(`Pre-run sweep skipped: ${err.message}`);
    }
  }

  const ctx = {
    page,
    base: args.base,
    secret,
    emailDomain,
    runId,
    account: account_,
    testCard,
    report,
    fixtures: { pricedSlugs: [], poaSlug: null },
    isMember: false,
  };

  // Discover product fixtures (logged out, after smoke) for the full run.
  for (const flow of FLOWS) {
    console.log(`\n▶ ${flow.meta.name}`);
    if (flow === register && !args.smokeOnly) {
      try {
        ctx.fixtures = await discoverFixtures(page, args.base);
        console.log(`  fixtures: ${ctx.fixtures.pricedSlugs.length} priced, POA=${ctx.fixtures.poaSlug || "none"}`);
      } catch (err) {
        console.warn(`  fixture discovery failed: ${err.message}`);
      }
      // Warm the heavy routes once so on-demand dev compilation doesn't surface
      // as per-step navigation timeouts in the flows below.
      console.log(`  warming routes…`);
      await warmUp(page, args.base, ctx.fixtures.pricedSlugs[0]).catch(() => {});
    }
    try {
      await flow.run(ctx);
    } catch (err) {
      await report.step({ flow: flow.meta.name, name: "unhandled error", severity: "blocker" }, async () => {
        throw err;
      });
    }
  }

  // Teardown — delete everything tagged for this run (and any sibling test rows).
  if (!args.smokeOnly && !args.keep) {
    console.log(`\n▶ teardown`);
    try {
      const counts = await purgeTestData({ emailLike });
      const remaining = await countTestCustomers(emailLike);
      report.teardown = { emailLike, counts, remaining };
      console.log(`  deleted test data; remaining test customers: ${remaining}`);
    } catch (err) {
      report.teardown = { emailLike, error: err.message };
      console.warn(`  teardown failed: ${err.message}`);
    }
  } else if (args.keep) {
    console.log(`\n(teardown skipped — --keep)`);
  }
} catch (err) {
  console.error(`Fatal: ${err.stack || err.message}`);
  exitCode = 1;
} finally {
  if (bctx) await bctx.close().catch(() => {});
  await closeSql().catch(() => {});
}

const { mdPath } = writeReport(report, {
  mode: args.smokeOnly ? "smoke-only" : "full",
  generatedAt: new Date().toISOString(),
});

const s = report.summary();
console.log(`\n──────────────────────────────────────────────`);
console.log(`Result: ${s.passed} passed · ${report.issues.length} issue(s) · ${s.skipped} skipped`);
console.log(`Blockers/broken: ${report.blockers.length}`);
console.log(`Report: ${mdPath}`);
console.log(`──────────────────────────────────────────────`);

if (report.blockers.length > 0) exitCode = exitCode || 1;
process.exit(exitCode);
