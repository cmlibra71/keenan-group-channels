// Shared harness: config, env loading, the step/report recorder, screenshots,
// and the test-login bypass helper. Flows receive a `ctx` built here and record
// every check through `ctx.report.step(...)`.
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
// tests/e2e/lib -> site root is three up.
export const SITE_ROOT = join(__dirname, "..", "..", "..");
export const E2E_ROOT = join(__dirname, "..");

/** Load the site .env into process.env without overriding already-set vars. */
export function loadSiteEnv() {
  const envPath = join(SITE_ROOT, ".env");
  if (existsSync(envPath)) {
    try {
      process.loadEnvFile(envPath); // Node does not override existing process.env entries
    } catch (err) {
      console.warn(`[harness] could not load ${envPath}: ${err.message}`);
    }
  }
}

/** Parse CLI flags shared by run.mjs. */
export function parseArgs(argv) {
  const args = { base: "http://localhost:3002", smokeOnly: false, headed: false, keep: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base") args.base = argv[++i];
    else if (a === "--smoke-only") args.smokeOnly = true;
    else if (a === "--headed") args.headed = true;
    else if (a === "--keep") args.keep = true; // skip teardown (debug)
  }
  args.base = args.base.replace(/\/$/, "");
  return args;
}

const SEVERITY = { blocker: 3, broken: 2, warning: 1 };

/** Collects step results and renders the markdown + json report. */
export class Report {
  constructor({ runId, base, artifactsDir }) {
    this.runId = runId;
    this.base = base;
    this.artifactsDir = artifactsDir;
    this.steps = [];
    this.skips = [];
    this.teardown = null;
    this._seq = 0;
    this._page = null;
  }

  setPage(page) {
    this._page = page;
  }

  _shotPath(label) {
    this._seq += 1;
    const safe = String(label).replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60);
    return join(this.artifactsDir, `${String(this._seq).padStart(2, "0")}-${safe}.png`);
  }

  async _screenshot(label) {
    if (!this._page) return null;
    const path = this._shotPath(label);
    try {
      await this._page.screenshot({ path, fullPage: false });
      return path;
    } catch {
      return null;
    }
  }

  /**
   * Run one named check. `fn(step)` may throw to fail; `step.note()` adds
   * context, `step.warn(msg)` downgrades a pass to a non-blocking warning,
   * `step.fail(severity, msg)` records a failure without throwing.
   */
  async step({ flow, name, route = "", severity = "broken" }, fn) {
    const started = Date.now();
    const rec = { flow, name, route, status: "pass", severity: null, durationMs: 0, notes: [], error: null, screenshot: null };
    const step = {
      note: (m) => rec.notes.push(String(m)),
      warn: (m) => {
        rec.status = rec.status === "fail" ? "fail" : "warn";
        rec.severity = "warning";
        rec.notes.push(`⚠ ${m}`);
      },
      fail: (sev, m) => {
        rec.status = "fail";
        rec.severity = sev;
        rec.notes.push(`✗ ${m}`);
      },
      page: this._page,
    };
    try {
      await fn(step);
    } catch (err) {
      rec.status = "fail";
      rec.severity = rec.severity || severity;
      rec.error = err && err.message ? err.message : String(err);
    }
    rec.durationMs = Date.now() - started;
    rec.screenshot = await this._screenshot(`${flow}-${name}`);
    this.steps.push(rec);
    const icon = rec.status === "pass" ? "✓" : rec.status === "warn" ? "⚠" : "✗";
    console.log(`  ${icon} [${flow}] ${name}${rec.error ? ` — ${rec.error}` : ""}`);
    return rec.status !== "fail";
  }

  skip({ flow, name, route = "" }, reason) {
    this.skips.push({ flow, name, route, reason });
    console.log(`  ⊘ [${flow}] ${name} — SKIPPED: ${reason}`);
  }

  get issues() {
    return this.steps.filter((s) => s.status === "fail" || s.status === "warn");
  }

  get blockers() {
    return this.steps.filter((s) => s.status === "fail" && SEVERITY[s.severity] >= 2);
  }

  summary() {
    const passed = this.steps.filter((s) => s.status === "pass").length;
    const warned = this.steps.filter((s) => s.status === "warn").length;
    const failed = this.steps.filter((s) => s.status === "fail").length;
    return { passed, warned, failed, skipped: this.skips.length, total: this.steps.length };
  }
}

/**
 * Establish a logged-in session for `email` via the guarded bypass route.
 * Uses the page's APIRequestContext so the Set-Cookie lands in the browser
 * context. Returns true on success.
 */
export async function bypassLogin(page, { base, secret, email }) {
  if (!secret) throw new Error("E2E_LOGIN_SECRET not set — cannot use the login bypass.");
  const res = await page.request.post(`${base}/api/test/login`, {
    data: { secret, email },
    headers: { "content-type": "application/json" },
  });
  if (!res.ok()) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(`bypass login failed (${res.status()}): ${bodyText.slice(0, 200)}`);
  }
  return true;
}

/**
 * Navigate and return the HTTP status (0 if no response object). Tolerant of
 * `next dev` on-demand compilation: a generous timeout, and one retry on a
 * navigation timeout (the route is usually compiled by the second attempt).
 */
export async function goto(page, base, path, opts = {}) {
  const url = `${base}${path}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000, ...opts });
      return res ? res.status() : 0;
    } catch (err) {
      const msg = err.message || "";
      // Ride through dev-compile lag and brief dev-server blips (crash/restart).
      const transient = /timeout|ERR_ABORTED|ERR_CONNECTION_REFUSED|ERR_EMPTY_RESPONSE|ERR_CONNECTION_RESET/i.test(msg);
      if (attempt < 2 && transient) {
        await page.waitForTimeout(2500);
        continue;
      }
      throw err;
    }
  }
  return 0;
}

/**
 * Pre-compile the heavy routes once so the timed flows hit warm (fast) pages.
 * `next dev` compiles routes on first hit (often 8–13s); paying that upfront as a
 * warm-up keeps it out of the per-step results. Best-effort — ignores errors.
 */
export async function warmUp(page, base, samplePdpSlug) {
  const routes = [
    "/",
    "/products",
    samplePdpSlug ? `/products/${samplePdpSlug}` : null,
    "/categories",
    "/brands",
    "/clearance",
    "/search?q=oven",
    "/cart",
    "/checkout",
    "/account",
    "/account/register",
    "/account/profile",
    "/account/orders",
    "/account/quotes",
    "/account/membership",
    "/membership",
  ].filter(Boolean);
  for (const r of routes) {
    await goto(page, base, r).catch(() => {});
  }
}

/**
 * Give React time to hydrate before interacting. Without this, clicks land
 * before handlers attach (no-op) and fills on controlled inputs get reset to
 * their initial state on the first render. Cheap and reliable for a test suite.
 */
export async function settle(page, ms = 700) {
  await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

/**
 * Fill a controlled input and confirm the value stuck (retrying through
 * hydration, which can wipe a too-early fill). Returns true if the value holds.
 */
export async function fillStable(page, selector, value, { timeout = 15000 } = {}) {
  const el = page.locator(selector).first();
  await el.waitFor({ state: "visible", timeout });
  for (let i = 0; i < 5; i++) {
    await el.fill(value).catch(() => {});
    await page.waitForTimeout(180);
    const v = await el.inputValue().catch(() => "");
    if (v === value) return true;
  }
  return false;
}

/**
 * Click a button that toggles UI (e.g. opens a slide-out), retrying through
 * hydration until `confirmSelector` becomes visible. Returns true on success.
 */
export async function clickUntil(page, clickSelector, confirmSelector, { tries = 4 } = {}) {
  const btn = page.locator(clickSelector).first();
  await btn.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
  for (let i = 0; i < tries; i++) {
    await btn.click({ timeout: 4000 }).catch(() => {});
    const ok = await page
      .locator(confirmSelector)
      .first()
      .waitFor({ state: "visible", timeout: 2500 })
      .then(() => true)
      .catch(() => false);
    if (ok) return true;
    await page.waitForTimeout(700); // let hydration catch up, then retry
  }
  return false;
}

/** Throw an AssertionError-style error when a condition is falsy. */
export function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

export function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}
