// Account management: edit profile, address-book CRUD, and orders list.
// Review submission is intentionally NOT exercised (it would create public,
// real-catalog content on prod) — recorded as a skip.
import { goto, assert, bypassLogin, settle, fillStable } from "../lib/harness.mjs";

export const meta = { name: "account", writes: true };

export async function run(ctx) {
  const { page, base, report, secret, account } = ctx;
  if (secret) await bypassLogin(page, { base, secret, email: account.email }).catch(() => {});

  await report.step({ flow: "account", name: "edit profile", route: "/account/profile" }, async (s) => {
    const status = await goto(page, base, "/account/profile");
    assert(status < 400, `HTTP ${status}`);
    await settle(page, 500);
    assert(await page.locator("#company").first().isVisible().catch(() => false), "profile form #company not visible");
    await fillStable(page, "#company", `${account.company} (edited)`);
    await fillStable(page, "#phone", "0411111111").catch(() => {});
    await page.getByRole("button", { name: /Save changes/ }).first().click();
    const saved = await page.locator("text=Saved.").first().waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false);
    if (!saved) s.warn("no 'Saved.' confirmation after profile save");
  });

  await report.step({ flow: "account", name: "address book add + delete", route: "/account/profile" }, async (s) => {
    await goto(page, base, "/account/profile");
    await settle(page, 500);
    const UNIQUE_ST = `${ctx.runId} Test Street`;
    const addBtn = page.getByRole("button", { name: /Add address/ }).first();
    if (!(await addBtn.isVisible().catch(() => false))) return s.warn("'Add address' button not found");
    await addBtn.click();
    // Wait for the address form to mount, then fill it (verify-and-retry).
    const ok = await page.locator("input[name='address1']").last().waitFor({ state: "visible", timeout: 6000 }).then(() => true).catch(() => false);
    if (!ok) return s.warn("address form did not open after clicking 'Add address'");
    // Verify-fill the required fields (address1/city/postalCode) so a hydration
    // race doesn't submit blanks that fail validation.
    const vfill = async (sel, val) => {
      const el = page.locator(sel).last();
      for (let i = 0; i < 4; i++) {
        await el.fill(val).catch(() => {});
        await page.waitForTimeout(150);
        if ((await el.inputValue().catch(() => "")) === val) return;
      }
    };
    await vfill("input[name='firstName']", account.firstName);
    await vfill("input[name='lastName']", account.lastName);
    await vfill("input[name='address1']", UNIQUE_ST);
    await vfill("input[name='city']", "Sydney");
    await page.locator("input[name='state']").last().fill("NSW").catch(() => {});
    await vfill("input[name='postalCode']", "2000");
    await page.getByRole("button", { name: /Save address/ }).first().click();
    await page.waitForTimeout(1500);

    // Reload and look for the card we just created (by its unique street).
    await goto(page, base, "/account/profile");
    await settle(page, 400);
    const addedCard = page.locator(`div:has-text("${UNIQUE_ST}")`).last();
    const hasAdded = await page.locator(`text=${UNIQUE_ST}`).first().isVisible().catch(() => false);
    if (!hasAdded) {
      s.warn("newly added address not visible after save — skipping delete to avoid removing the billing address");
      return;
    }
    // Delete ONLY the address we added (never the membership billing address).
    const delBtn = addedCard.locator("button[aria-label='Delete']").first();
    if (await delBtn.isVisible().catch(() => false)) {
      await delBtn.click().catch(() => {});
      await page.waitForTimeout(1200);
      const stillThere = await page.locator(`text=${UNIQUE_ST}`).first().isVisible().catch(() => false);
      if (stillThere) s.warn("added address still present after delete");
      else s.note("added address created and deleted successfully");
    } else {
      s.warn("delete control not found on the added address card");
    }
  });

  await report.step({ flow: "account", name: "orders list", route: "/account/orders" }, async (s) => {
    const status = await goto(page, base, "/account/orders");
    assert(status < 400, `HTTP ${status}`);
    const empty = await page.locator("text=/no orders|haven.t placed/i").first().isVisible().catch(() => false);
    if (empty) s.note("orders list empty (checkout flow may have skipped placing an order)");
  });

  report.skip(
    { flow: "account", name: "submit product review", route: "/products/[slug]" },
    "not exercised — would create public content against a real production product"
  );
}
