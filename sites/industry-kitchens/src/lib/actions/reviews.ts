"use server";

import { refresh } from "next/cache";
import { reviewService, productService, CHANNEL_ID } from "@/lib/store";
import { sendStaffNotification } from "@/lib/staff-email";

export async function submitReview(
  productId: number,
  data: { rating: number; title: string; text: string; authorName: string }
) {
  if (data.rating < 1 || data.rating > 5) {
    return { error: "Rating must be between 1 and 5" };
  }
  if (!data.authorName.trim()) {
    return { error: "Name is required" };
  }
  if (!data.text.trim()) {
    return { error: "Review text is required" };
  }

  // Only accept reviews for a real product that is actually on THIS storefront —
  // otherwise the (unauthenticated) action lets anyone flood the moderation queue with
  // reviews against arbitrary or nonexistent product ids.
  if (!Number.isInteger(productId) || !(await productService.existsOnChannel(productId, CHANNEL_ID))) {
    return { error: "Product not found." };
  }

  await reviewService.create({
    productId,
    rating: data.rating,
    title: data.title.trim() || null,
    text: data.text.trim(),
    authorName: data.authorName.trim(),
    status: "pending",
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
        ["Title", data.title.trim() || "—"],
        ["Author", data.authorName.trim()],
        ["Review", data.text.trim().slice(0, 300)],
      ],
      portalPath: "/dashboard/products/reviews?status=pending",
      linkLabel: "Moderate reviews",
    });
  } catch (e) {
    console.error("[submitReview] staff notification failed (non-fatal):", e);
  }

  refresh(); // acting user's view refreshes; shared data cache stays intact
  return { success: true };
}
