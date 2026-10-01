"use server";

// Zoey's "Add to Wishlist" (IK parity round 3: the up-sell tiles of layouts that show it). One
// wishlist per signed-in shopper; a guest is sent to sign in and comes back to the page.

import { revalidatePath } from "next/cache";
import { addToContactWishlist, removeFromContactWishlist } from "@keenan/services";
import { getSession } from "@/lib/auth";
import { isProductVisibleToViewer } from "@/lib/catalog-scope";
import { signInRedirect } from "@/lib/account-redirect";

export async function addToWishlist(
  productId: number,
  returnTo: string
): Promise<{ success?: boolean; error?: string; signIn?: string }> {
  const session = await getSession();
  if (!session) return { signIn: signInRedirect(returnTo.startsWith("/") ? returnTo : "/") };
  if (!Number.isInteger(productId) || productId <= 0) return { error: "That product could not be added." };
  if (!(await isProductVisibleToViewer(productId))) return { error: "That product could not be added." };
  await addToContactWishlist(session.contactId, productId);
  revalidatePath("/account/wishlist");
  return { success: true };
}

export async function removeFromWishlist(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const productId = Number(formData.get("productId"));
  if (!Number.isInteger(productId) || productId <= 0) return;
  await removeFromContactWishlist(session.contactId, productId);
  revalidatePath("/account/wishlist");
}
