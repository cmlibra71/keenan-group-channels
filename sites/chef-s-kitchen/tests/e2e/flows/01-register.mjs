// Register a tagged test account via the real /account/register form, then
// confirm we land logged-in on /account.
import { goto, assert } from "../lib/harness.mjs";
import { registerViaForm, isLoggedOut } from "../lib/site.mjs";

export const meta = { name: "register", writes: true };

export async function run(ctx) {
  const { page, base, report, account } = ctx;

  await report.step({ flow: "register", name: "register new account", route: "/account/register" }, async (s) => {
    await registerViaForm(page, base, account);
    // Success redirects to /account; an error stays on the register page.
    const err = await page.locator(".alert-error").first().textContent().catch(() => null);
    if (err && /already exists/i.test(err)) {
      s.warn("account already existed (prior run not cleaned?) — continuing");
      return;
    }
    assert(!err, `register error: ${err}`);
    const url = page.url();
    assert(/\/account(\/|$|\?)/.test(url) || url.endsWith("/account"), `unexpected post-register url: ${url}`);
  });

  await report.step({ flow: "register", name: "logged-in on /account", route: "/account" }, async (s) => {
    await goto(page, base, "/account");
    assert(!(await isLoggedOut(page)), "still showing the login form after registering");
    const hasAccount = await page.locator("text=My Account").first().isVisible().catch(() => false);
    if (!hasAccount) s.warn("'My Account' heading not visible");
  });
}
