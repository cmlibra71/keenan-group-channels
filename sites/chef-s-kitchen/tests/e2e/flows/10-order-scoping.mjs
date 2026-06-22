// Security: order history must be scoped to the logged-in customer. We found
// that `orders` has no customer_id column yet /account/orders filters by it — so
// this verifies a SECOND customer (B) cannot see the FIRST customer's (A) order.
import { goto, assert, bypassLogin } from "../lib/harness.mjs";
import { registerViaForm, isLoggedOut, logoutViaPanel } from "../lib/site.mjs";

export const meta = { name: "order-scoping", writes: true };

export async function run(ctx) {
  const { page, base, report, runId, emailDomain } = ctx;

  if (!ctx.lastOrderNumber) {
    report.skip(
      { flow: "order-scoping", name: "cross-customer order visibility", route: "/account/orders" },
      "no order was placed in the checkout flow to test isolation against"
    );
    return;
  }

  const accountB = {
    email: `e2e-${runId}-b@${emailDomain}`,
    password: "Test1234!aA",
    firstName: "E2E",
    lastName: `B${runId}`,
  };
  ctx.accountB = accountB;

  await report.step({ flow: "order-scoping", name: "register a second customer (B)", route: "/account/register" }, async (s) => {
    const { secret } = ctx;
    const establishB = async () => {
      // Must be logged out first — /account/register bounces logged-in users away.
      await logoutViaPanel(page, base);
      await registerViaForm(page, base, accountB);
      await goto(page, base, "/account");
      if (!(await isLoggedOut(page))) return true;
      // Register may have created B but the session didn't stick (dev-bundle
      // server-action staleness). If B now exists, the bypass establishes it.
      if (secret) {
        const ok = await bypassLogin(page, { base, secret, email: accountB.email }).then(() => true).catch(() => false);
        if (ok) {
          await goto(page, base, "/account");
          return !(await isLoggedOut(page));
        }
      }
      return false;
    };
    let ok = await establishB();
    if (!ok) {
      s.note("first register attempt did not establish a session — retrying");
      ok = await establishB();
    }
    assert(ok, "could not establish account B's session");
  });

  await report.step({ flow: "order-scoping", name: "B must NOT see A's order", route: "/account/orders" }, async (s) => {
    const status = await goto(page, base, "/account/orders");
    assert(status < 400, `HTTP ${status}`);
    const body = (await page.locator("main").innerText().catch(() => "")) || "";
    const orderLinks = await page.locator("a[href*='/account/orders/'], [data-order-number]").count().catch(() => 0);

    if (body.includes(ctx.lastOrderNumber)) {
      s.fail(
        "blocker",
        `PRIVACY LEAK: customer B's order history shows customer A's order ${ctx.lastOrderNumber}`
      );
      return;
    }
    if (/no orders/i.test(body)) {
      s.note("B's order history is correctly empty");
    } else if (orderLinks > 0) {
      s.warn(`B sees ${orderLinks} order(s) it did not place (not A's order, but order history may not be customer-scoped)`);
    } else {
      s.note("B does not see A's order");
    }
  });
}
