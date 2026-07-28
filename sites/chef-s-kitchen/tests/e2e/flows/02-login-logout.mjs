// Exercise all three auth transitions on the account created in flow 01:
//   1. logout via the header Account panel ("Sign Out")
//   2. login via the real /account form
//   3. logout again, then login via the guarded bypass route
// Ends logged-in (via bypass) so later flows have a session.
import { goto, assert, bypassLogin } from "../lib/harness.mjs";
import { isLoggedOut, loginViaForm, logoutViaPanel } from "../lib/site.mjs";

export const meta = { name: "auth", writes: false };

export async function run(ctx) {
  const { page, base, report, account, secret } = ctx;

  await report.step({ flow: "auth", name: "logout via account panel", route: "/account" }, async (s) => {
    const loggedOut = await logoutViaPanel(page, base);
    assert(loggedOut, "still logged in after using the account panel's Sign Out");
  });

  await report.step({ flow: "auth", name: "login via form", route: "/account" }, async () => {
    // Assert on the action's own response first — the form lives AT /account, so
    // a DOM check alone can't distinguish "logged in" from "never submitted".
    const status = await loginViaForm(page, base, account.email, account.password);
    assert(status === 303, `login POST returned ${status ?? "no response"} (303 = success)`);
    await goto(page, base, "/account");
    assert(!(await isLoggedOut(page)), "login form did not establish a session");
  });

  await report.step({ flow: "auth", name: "logout + bypass login", route: "/api/test/login" }, async (s) => {
    await logoutViaPanel(page, base);
    if (!secret) {
      s.fail("broken", "E2E_LOGIN_SECRET not set — bypass route untested");
      return;
    }
    await bypassLogin(page, { base, secret, email: account.email });
    await goto(page, base, "/account");
    assert(!(await isLoggedOut(page)), "bypass login did not establish a session");
  });
}
