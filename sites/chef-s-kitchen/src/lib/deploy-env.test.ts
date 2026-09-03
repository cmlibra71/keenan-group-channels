import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * THE STOREFRONT CONTAINER'S OWN EMAIL ENVIRONMENT, asserted against the deploy workflow.
 *
 * A storefront is not just a shop front — it MAILS CUSTOMERS. The checkout sends the order
 * confirmation, `payQuote` sends the order pair, `acceptQuote` sends the PRO-FORMA, and the
 * account area sends the password reset. Every one goes through services `safeSesSend`, which
 * stamps `AWS_SES_CONFIGURATION_SET` on the SES command and records the send on the order, the
 * quote and the person.
 *
 * That configuration set is the ONLY thing that makes SES publish Delivery / Bounce / Complaint
 * events to SNS, which is how a trail row ever moves off "Sent" [card oLF9OgFs]. The portal's env
 * file has always carried it and the worker's was fixed on card 72qdt41B, when a live reminder
 * wrote its row and then sat at "Sent" for ever. The storefront env block had the same hole, and
 * this card widened what it costs: the pro-forma is now recorded on the quote's Emails card, so a
 * missing configuration set is the difference between a trail that reports delivery and one that
 * cannot.
 *
 * `TEST_EMAIL_DOMAINS` is the other half, for the same reason it mattered on the worker: without
 * it `resolveTestRedirect` still defaults to `e2e.test`, but the pair is what makes the guard a
 * property of the container rather than a default nobody may change. `AWS_SES_REGION` is what the
 * services SES client actually reads — `AWS_REGION` alone leaves it on its own fallback.
 *
 * A config assertion rather than a unit test, because the defect lives in configuration: the code
 * is right and the container it runs in is not. CI runs no tests here, so this guards the deploy
 * wave's local ladder and the next person editing that env block — it is a tripwire, not a gate.
 */
function findWorkflow(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    const candidate = join(dir, ".github", "workflows", "deploy.yml");
    if (existsSync(candidate)) return readFileSync(candidate, "utf8");
    dir = dirname(dir);
  }
  throw new Error("deploy.yml not found walking up from this test");
}

const WORKFLOW = findWorkflow();

/** The heredoc that becomes `/home/ubuntu/deploy/env/<site>.env` on the host. */
function storefrontEnvBlock(): string {
  const start = WORKFLOW.indexOf("CHANNEL_KEY=${{ matrix.site }}");
  assert.ok(start > -1, "the storefront env block moved — this assertion needs rewriting");
  const end = WORKFLOW.indexOf("EOF", start);
  assert.ok(end > start, "the storefront env heredoc has no terminator");
  return WORKFLOW.slice(start, end);
}

test("the storefront container can have its customer email tracked by SES", () => {
  const env = storefrontEnvBlock();
  assert.match(
    env,
    /AWS_SES_CONFIGURATION_SET=keenan-portal-delivery/,
    "without it every trail row this storefront writes is stuck on 'Sent' for ever"
  );
  assert.match(env, /AWS_SES_REGION=ap-southeast-2/, "the services SES client reads AWS_SES_REGION");
});

test("the storefront container carries the test-safety guard", () => {
  const env = storefrontEnvBlock();
  assert.match(env, /TEST_EMAIL_RECIPIENT=/, "a fake @e2e.test address must be swapped, never mailed");
  assert.match(env, /TEST_EMAIL_DOMAINS=/, "which domains are fake is a property of the container");
});
