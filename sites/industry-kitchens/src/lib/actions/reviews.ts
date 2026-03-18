"use server";

import { revalidatePath } from "next/cache";
import { reviewService } from "@/lib/store";

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
