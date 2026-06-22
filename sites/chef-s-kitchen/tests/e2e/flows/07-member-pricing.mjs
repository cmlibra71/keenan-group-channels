// Member pricing — capture how a product's price renders as a member vs as a
// guest, and report the difference. Deliberately does NOT hard-assert the
// direction: project memory says guests may now see exact member prices, while
// a code read suggested guests see RRP only. We record what actually renders and
// flag a mismatch instead of guessing the rule.
import { goto, bypassLogin, settle } from "../lib/harness.mjs";
import { logoutViaPanel, pdpHeadlinePrice, firstCartUnitPrice, addSlugToCart, clearCart } from "../lib/site.mjs";
import { getCustomerMembership } from "../lib/db.mjs";

export const meta = { name: "member-pricing", writes: false };

async function capturePdp(page) {
  return page.evaluate(() => {
    const text = document.querySelector("main")?.innerText || document.body.innerText || "";
    return {
      memberBadge: /member price/i.test(text),
      joinTeaser: /not a member|join (from|now)/i.test(text),
      savings: /you save/i.test(text),
      // First $-amount on the page as a rough price signal.
      firstPrice: (text.match(/\$\s?[\d,]+(?:\.\d{2})?/) || [])[0] || null,
    };
  });
}

export async function run(ctx) {
  const { page, base, report, fixtures, secret, account } = ctx;

  if (!ctx.isMember) {
    report.skip({ flow: "member-pricing", name: "member vs guest price", route: "" }, "membership was not activated (see membership flow)");
    return;
  }
  const slug = fixtures?.pricedSlugs?.[0];
  if (!slug) {
    report.skip({ flow: "member-pricing", name: "member vs guest price", route: "" }, "no priced product fixture");
    return;
  }

  let memberView = null;
  let guestView = null;

  await report.step({ flow: "member-pricing", name: "capture member view", route: `/products/${slug}` }, async (s) => {
    if (secret) await bypassLogin(page, { base, secret, email: account.email }).catch(() => {});
    await goto(page, base, `/products/${slug}`);
    await settle(page, 400);
    memberView = await capturePdp(page);
    s.note(`member view: ${JSON.stringify(memberView)}`);
  });

  // Correctness: the member price SHOWN on the PDP must equal the price CHARGED
  // in the cart (catches the classic "PDP shows member price, cart charges RRP").
  await report.step({ flow: "member-pricing", name: "member price: displayed == charged", route: "/cart" }, async (s) => {
    await goto(page, base, `/products/${slug}`);
    await settle(page, 400);
    const shown = await pdpHeadlinePrice(page);
    await clearCart(page, base); // ensure a single line for an unambiguous read
    const added = await addSlugToCart(page, base, slug);
    if (!added) return s.warn("could not add the product to the cart to verify the charged price");
    await goto(page, base, "/cart");
    await settle(page, 300);
    const charged = await firstCartUnitPrice(page);
    const mem = await getCustomerMembership(ctx.account.email).catch(() => null);
    s.note(`member PDP price = ${shown}, cart unit price = ${charged}`);
    s.note(`DB: customer_group_id=${mem?.customer_group_id ?? "null"}, sub_status=${mem?.sub_status ?? "none"}`);
    if (shown == null || charged == null) {
      s.warn("could not parse both the displayed and charged prices — not verified");
      return;
    }
    if (Math.abs(shown - charged) > 0.02) {
      s.fail("broken", `member price mismatch: PDP shows $${shown} but cart charges $${charged}`);
    } else {
      s.note("displayed member price matches the charged price ✓");
    }
    await clearCart(page, base); // leave the cart clean for later flows
  });

  await report.step({ flow: "member-pricing", name: "capture guest view", route: `/products/${slug}` }, async (s) => {
    await logoutViaPanel(page, base); // view as a guest
    await goto(page, base, `/products/${slug}`);
    await settle(page, 400);
    guestView = await capturePdp(page);
    s.note(`guest view: ${JSON.stringify(guestView)}`);
    // Restore the member session for later flows.
    if (secret) await bypassLogin(page, { base, secret, email: account.email }).catch(() => {});
  });

  await report.step({ flow: "member-pricing", name: "member/guest pricing differs as expected", route: `/products/${slug}` }, async (s) => {
    s.note(`member: ${JSON.stringify(memberView)}`);
    s.note(`guest:  ${JSON.stringify(guestView)}`);
    const memberShowsMemberSignal = memberView?.memberBadge || memberView?.savings;
    const guestShowsJoin = guestView?.joinTeaser;
    if (!memberShowsMemberSignal && !guestShowsJoin && memberView?.firstPrice === guestView?.firstPrice) {
      s.warn("no observable member/guest pricing difference on this product (member pricing may be disabled or this product has no member price)");
    } else {
      s.note("observed a member/guest pricing difference (see captures above)");
    }
  });
}
