// Self-service password reset: request a link (enumeration-safe neutral response),
// then complete the reset with a real token and prove the NEW password
// authenticates. The token is minted via the guarded /api/test/auth-token route
// because the real flow only stores the token hash (the link goes by email).
import { goto, assert, settle, fillStable, mintAuthToken } from "../lib/harness.mjs";

export const meta = { name: "password-reset", writes: true };

export async function run(ctx) {
  const { page, base, report, secret, account } = ctx;

  await report.step(
    { flow: "password-reset", name: "request reset link", route: "/account/forgot-password" },
    async (s) => {
      const status = await goto(page, base, "/account/forgot-password");
      assert(status < 400, `HTTP ${status}`);
      await settle(page, 400);
      await fillStable(page, "#email", account.email);
      await page.getByRole("button", { name: /Send reset link/i }).first().click();
      const ok = await page
        .locator("text=/sent a link|check your inbox/i")
        .first()
        .waitFor({ state: "visible", timeout: 8000 })
        .then(() => true)
        .catch(() => false);
      if (!ok) s.warn("no neutral success message after requesting a reset link");
    }
  );

  if (!secret) {
    report.skip(
      { flow: "password-reset", name: "complete reset", route: "/account/reset-password/[token]" },
      "E2E_LOGIN_SECRET not set — cannot mint a reset token"
    );
    return;
  }

  const newPassword = `Reset${ctx.runId}!aA`;

  await report.step(
    { flow: "password-reset", name: "reset password with token", route: "/account/reset-password/[token]" },
    async () => {
      const token = await mintAuthToken(page, { base, secret, email: account.email, type: "password_reset" });
      const status = await goto(page, base, `/account/reset-password/${token}`);
      assert(status < 400, `HTTP ${status}`);
      await settle(page, 400);
      await fillStable(page, "#password", newPassword);
      await fillStable(page, "#confirmPassword", newPassword);
      await page.getByRole("button", { name: /Set new password/i }).first().click();
      // resetPassword logs the customer in and redirects to /account on success.
      await page.waitForURL(/\/account(\?|$|\/)/, { timeout: 12000 }).catch(() => {});
      assert(/\/account/.test(page.url()), `expected redirect to /account, still at ${page.url()}`);
    }
  );

  await report.step(
    { flow: "password-reset", name: "login with new password", route: "/account" },
    async () => {
      await page.context().clearCookies().catch(() => {});
      const status = await goto(page, base, "/account");
      assert(status < 400, `HTTP ${status}`);
      await settle(page, 400);
      await fillStable(page, "#email", account.email);
      await fillStable(page, "#password", newPassword);
      // The login form lives AT /account, so a URL/visibility wait can't tell a
      // successful login from a rejected one. Assert on the action's own response:
      // login() redirects (303) on success and returns 200 (with an error) on bad
      // credentials.
      const [resp] = await Promise.all([
        page
          .waitForResponse((r) => r.url().replace(/\?.*$/, "").endsWith("/account") && r.request().method() === "POST", { timeout: 15000 })
          .catch(() => null),
        page.getByRole("button", { name: /^Sign In$/i }).first().click(),
      ]);
      assert(resp && resp.status() === 303, `new password did not authenticate (login POST status ${resp ? resp.status() : "none"})`);
    }
  );

  // Keep ctx consistent for later flows (the account row now has this password).
  ctx.account.password = newPassword;
}
