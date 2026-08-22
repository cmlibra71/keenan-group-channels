import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptanceAcknowledgementUrl } from "./acknowledgement-url.ts";

const UUID = "ed47a45a-358d-49b6-9c42-2795c64cae08";

// The two live site rows, read from production 2026-08-22.
const CHEFS_DEPOT = { url: "https://chefsdepot.com.au", publicSubdomain: "quotes" };
const INDUSTRY_KITCHENS = { url: "https://industrialkitchens.com.au", publicSubdomain: "quotes" };

test("a Chefs Depot customer stays on Chefs Depot's own quotes host", () => {
  // The whole point of the rule: accepting inside chefsdepot.com.au must not
  // throw the customer to keenan-group.com.au, the parent group's domain, whose
  // root is the staff portal. CD and IK are separate businesses.
  assert.equal(
    acceptanceAcknowledgementUrl(UUID, CHEFS_DEPOT),
    `https://quotes.chefsdepot.com.au/q/${UUID}/accepted?from=account`
  );
});

test("each storefront gets its OWN host, never the other business's", () => {
  const cd = acceptanceAcknowledgementUrl(UUID, CHEFS_DEPOT)!;
  const ik = acceptanceAcknowledgementUrl(UUID, INDUSTRY_KITCHENS)!;
  assert.ok(cd.includes("chefsdepot.com.au"));
  assert.ok(!cd.includes("industrialkitchens"));
  assert.ok(ik.includes("industrialkitchens.com.au"));
  assert.ok(!ik.includes("chefsdepot"));
});

test("it is the SAME host the emailed quote link uses", () => {
  // Both are built by `publicQuoteUrl`, so the two acceptance paths — inbox and
  // account area — land the customer on one address. That is the reason this
  // module exists rather than an env var.
  const ack = acceptanceAcknowledgementUrl(UUID, CHEFS_DEPOT)!;
  assert.ok(ack.startsWith(`https://quotes.chefsdepot.com.au/q/${UUID}`));
});

test("it carries from=account, which is what turns the countdown to /account", () => {
  assert.ok(acceptanceAcknowledgementUrl(UUID, CHEFS_DEPOT)!.endsWith("/accepted?from=account"));
});

test("a channel with no site row falls back to a real page, never a dead one", () => {
  // PORTAL_BASE_URL is unset in the deploy workflow, so this is production's
  // fallback shape. It must still be an address that answers.
  const url = acceptanceAcknowledgementUrl(UUID, null)!;
  assert.equal(url, `https://keenan-group.com.au/q/${UUID}/accepted?from=account`);
  assert.equal(acceptanceAcknowledgementUrl(UUID, { url: null, publicSubdomain: null }), url);
});

test("no uuid means no link at all — never a broken one", () => {
  // The caller then leaves the customer on the page and refreshes it.
  assert.equal(acceptanceAcknowledgementUrl(null, CHEFS_DEPOT), null);
  assert.equal(acceptanceAcknowledgementUrl(undefined, CHEFS_DEPOT), null);
  assert.equal(acceptanceAcknowledgementUrl("", CHEFS_DEPOT), null);
});

test("a site with no public subdomain serves the quote on its apex", () => {
  assert.equal(
    acceptanceAcknowledgementUrl(UUID, { url: "https://example.com/", publicSubdomain: null }),
    `https://example.com/q/${UUID}/accepted?from=account`
  );
});
