"use server";

import { reviewService, productService, contactService, CHANNEL_ID } from "@/lib/store";
import { sendStaffNotification } from "@/lib/staff-email";
import { getSession } from "@/lib/auth";
import { callerIpKey, enforceLimit } from "@/lib/security/rate-limits";

export interface SubmitReviewInput {
  rating: number;
  title: string;
  text: string;
  authorName: string;
  /** The form's hidden spam trap. Empty for every human. */
  honeypot?: string;
}

export async function submitReview(productId: number, data: SubmitReviewInput) {
  // ── Spam guard, half one: the honeypot (card qxVqy5Dn) ────────────────────
  // Zoey puts a captcha on this form; this action has been open to anyone. The
  // form carries a hidden, tab-skipped field a shopper never sees, so anything
  // in it came from a script. Answer exactly as a success does: a bot that is
  // told it was rejected simply tries again without the field.
  if (typeof data.honeypot === "string" && data.honeypot.trim() !== "") {
    return { success: true };
  }

  if (data.rating < 1 || data.rating > 5) {
    return { error: "Rating must be between 1 and 5" };
  }
  if (!data.authorName.trim()) {
    return { error: "Name is required" };
  }
  // Zoey requires a title as well as a body, and card qxVqy5Dn matches its
  // fields exactly. An optional title is how review 92 came in with the boxes
  // filled in the wrong order.
  if (!data.title.trim()) {
    return { error: "Review title is required" };
  }
  if (!data.text.trim()) {
    return { error: "Review text is required" };
  }

  // ── Spam guard, half two: a per-visitor, per-PRODUCT budget ───────────────
  // The identifier is the caller's own bucket key plus the product, so the
  // `account` bucket in the `product_review` policy is "this visitor, this
  // product" — one shopper cannot paper a single listing, and a genuine review
  // of a different product is never charged for it. The policy's `ip` bucket is
  // the envelope over the whole site. Checked BEFORE the product lookup so a
  // flood costs no queries.
  const ip = await callerIpKey();
  const limit = await enforceLimit("product_review", {
    identifier: `${ip}|product:${productId}`,
    identifierIsEmail: false,
    surface: "product_review_submit",
  });
  if (!limit.allowed) {
    return { error: limit.message };
  }

  // Only accept reviews for a real product that is actually on THIS storefront —
  // otherwise the (unauthenticated) action lets anyone flood the moderation queue with
  // reviews against arbitrary or nonexistent product ids.
  if (!Number.isInteger(productId) || !(await productService.existsOnChannel(productId, CHANNEL_ID))) {
    return { error: "Product not found." };
  }

  // Record WHO wrote it when we know (card qxVqy5Dn). A signed-in shopper is a
  // `contacts` row, and the contact carries the account, so stamping the contact
  // is what links the review to the customer record on every screen that needs
  // it. Signed-out reviews stay exactly as they were: a typed name and nothing
  // else. Best-effort — an unreadable cookie must not cost a shopper their
  // review.
  const session = await getSession().catch(() => null);
  // A session cookie outlives the contact it names (a merge, a delete, an E2E
  // teardown), and `product_reviews.contact_id` is a real foreign key — stamping
  // an id that is gone makes the whole create 422 and the shopper loses their
  // review over somebody else's housekeeping. Confirm the row is still there
  // before claiming it; when it is not, save the review as a signed-out one.
  const contactId =
    session && (await contactService.getById(session.contactId).catch(() => null))
      ? session.contactId
      : null;

  await reviewService.create({
    productId,
    rating: data.rating,
    title: data.title.trim(),
    text: data.text.trim(),
    authorName: data.authorName.trim(),
    status: "pending",
    ...(contactId !== null && session
      ? { contactId, authorEmail: session.email }
      : {}),
  });

  // Reviews sit invisible in the pending moderation queue until someone looks —
  // tell staff one arrived. Best-effort: the review is already saved.
  try {
    await sendStaffNotification({
      audience: "staff",
      subject: `New product review pending approval (${data.rating}/5)`,
      heading: "A customer submitted a product review",
      rows: [
        ["Rating", `${data.rating}/5`],
        ["Title", data.title.trim()],
        ["Author", data.authorName.trim()],
        ["Signed in as", contactId !== null ? (session?.email ?? "") : "Not signed in"],
        ["Review", data.text.trim().slice(0, 300)],
      ],
      portalPath: "/dashboard/products/reviews?status=pending",
      linkLabel: "Moderate reviews",
      // No order and no quote to record it against, so it lands on the platform trail
      // (card wlEdBRZX).
      emailKind: "review_pending_alert",
    });
  } catch (e) {
    console.error("[submitReview] staff notification failed (non-fatal):", e);
  }

  // Deliberately NO `refresh()` here. The review lands PENDING, so nothing on
  // this page changes — and re-rendering the route remounts the tab panel and
  // throws away the "Thank you for your review" the shopper is owed (card
  // qxVqy5Dn: they must be told it will appear once approved). Approving one is
  // what publishes it, and that happens in the portal.
  return { success: true };
}
