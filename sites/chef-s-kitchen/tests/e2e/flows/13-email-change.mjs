// Self-service email change: request the change from the security page (verifies
// the current password, neutral response), confirm with a real token, and prove
// the NEW email is now the account's login. The change-to address stays inside
// the test domain so teardown's `e2e-%@e2e.test` sweep still reclaims it.
import { goto, assert, settle, fillStable, bypassLogin, mintAuthToken } from "../lib/harness.mjs";

export const meta = { name: "email-change", writes: true };

export async function run(ctx) {
  const { page, base, report, secret, account, emailDomain, runId } = ctx;

  if (!secret) {
    report.skip(
      { flow: "email-change", name: "change email", route: "/account/security" },
      "E2E_LOGIN_SECRET not set — cannot bypass login or mint a token"
    );
    return;
  }

  await bypassLogin(page, { base, secret, email: account.email }).catch(() => {});
  const newEmail = `e2e-${runId}-changed@${emailDomain}`;

  await report.step(
    { flow: "email-change", name: "request email change", route: "/account/security" },
    async (s) => {
      const status = await goto(page, base, "/account/security");
      assert(status < 400, `HTTP ${status}`);
      await settle(page, 400);
      await fillStable(page, "#newEmail", newEmail);
      await fillStable(page, "#emailCurrentPassword", account.password);
      await page.getByRole("button", { name: /Send confirmation link/i }).first().click();
      const ok = await page
        .locator("text=/check your new inbox|confirm the change/i")
        .first()
        .waitFor({ state: "visible", timeout: 8000 })
        .then(() => true)
        .catch(() => false);
      if (!ok) s.warn("no neutral success message after requesting an email change");
    }
  );

  await report.step(
    { flow: "email-change", name: "confirm email change with token", route: "/account/verify-email/[token]" },
    async () => {
      const token = await mintAuthToken(page, {
        base,
        secret,
        email: account.email,
        type: "email_change",
        newEmail,
      });
      const status = await goto(page, base, `/account/verify-email/${token}`);
      assert(status < 400, `HTTP ${status}`);
      await settle(page, 400);
      await page.getByRole("button", { name: /Confirm email change/i }).first().click();
      const ok = await page
        .locator("text=/email address has been updated/i")
        .first()
        .waitFor({ state: "visible", timeout: 12000 })
        .then(() => true)
        .catch(() => false);
      assert(ok, "no success confirmation after confirming the email change");
    }
  );

  await report.step(
    { flow: "email-change", name: "new email is the active login", route: "/account/security" },
    async (s) => {
      await page.context().clearCookies().catch(() => {});
      await bypassLogin(page, { base, secret, email: newEmail });
      const status = await goto(page, base, "/account/security");
      assert(status < 400, `HTTP ${status}`);
      await settle(page, 400);
      const shows = await page.locator(`text=${newEmail}`).first().isVisible().catch(() => false);
      if (!shows) s.warn(`security page did not show the new email ${newEmail}`);
    }
  );

  // The customer row now carries newEmail — keep ctx aligned (teardown's
  // e2e-%@e2e.test sweep matches both the old and new addresses regardless).
  ctx.account.email = newEmail;
}
