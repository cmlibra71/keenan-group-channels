// Member-only extras: prize draws, partner offers (member sees codes; guests see
// masked previews), and cancelling the membership (two-step modal). Runs last
// because cancelling ends the member state.
import { goto, assert, bypassLogin, settle } from "../lib/harness.mjs";

export const meta = { name: "member-extras", writes: true };

export async function run(ctx) {
  const { page, base, report, secret, account } = ctx;
  if (secret) await bypassLogin(page, { base, secret, email: account.email }).catch(() => {});

  await report.step({ flow: "member-extras", name: "draws page", route: "/account/draws" }, async (s) => {
    const status = await goto(page, base, "/account/draws");
    if (status >= 400) return s.warn(`draws HTTP ${status} (feature may be disabled)`);
    const hasDraws = await page.locator("text=/entries|draw|upcoming/i").first().isVisible().catch(() => false);
    if (!hasDraws) s.note("draws page rendered but no draw content (feature off or none scheduled)");
  });

  await report.step({ flow: "member-extras", name: "partner offers (member view)", route: "/account/partner-offers" }, async (s) => {
    const status = await goto(page, base, "/account/partner-offers");
    assert(status < 400, `HTTP ${status}`);
    const masked = await page.locator("text=XXXX-XXXX-XXXX").first().isVisible().catch(() => false);
    if (ctx.isMember && masked) s.warn("member still sees MASKED partner codes (should be unlocked)");
    else s.note(masked ? "codes masked (non-member view)" : "partner codes visible/unlocked for member");
  });

  if (!ctx.isMember) {
    report.skip({ flow: "member-extras", name: "cancel membership", route: "/account/membership" }, "no active membership to cancel");
    return;
  }

  await report.step({ flow: "member-extras", name: "cancel membership", route: "/account/membership" }, async (s) => {
    await goto(page, base, "/account/membership");
    await settle(page, 500);
    const trigger = page.getByRole("button", { name: /^Cancel membership$/i }).first();
    if (!(await trigger.isVisible().catch(() => false))) {
      return s.warn("'Cancel membership' trigger not found");
    }
    await trigger.click();
    // Confirm in the modal.
    const confirm = page.getByRole("button", { name: /^Cancel Membership$/ }).first();
    const opened = await confirm.waitFor({ state: "visible", timeout: 4000 }).then(() => true).catch(() => false);
    assert(opened, "cancel confirmation modal did not open");
    await confirm.click();
    await page.waitForTimeout(1500);
    const cancelled = await page
      .locator("text=/cancel|ends on|until the end|reactivate/i")
      .first()
      .isVisible()
      .catch(() => false);
    if (!cancelled) s.warn("no post-cancel confirmation/ends-on state visible");
    ctx.isMember = false;
  });
}
