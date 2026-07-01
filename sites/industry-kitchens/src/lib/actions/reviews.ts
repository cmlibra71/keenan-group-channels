"use server";

import { revalidatePath } from "next/cache";
import { reviewService, productService, CHANNEL_ID } from "@/lib/store";

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

  revalidatePath("/", "layout");
  return { success: true };
}
