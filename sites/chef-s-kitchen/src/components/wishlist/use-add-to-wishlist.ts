"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addToWishlist } from "@/lib/actions/wishlist";

/**
 * One click on "Add to Wishlist", wherever it is drawn. Magento parity: signed in, the product is
 * added and the shopper lands on their wishlist with it announced; signed out, they are sent to
 * sign in and it is added once they have. A refusal (product gone, rate limit) is shown in place.
 */
export function useAddToWishlist() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const add = (productId: number, variantId?: number | null, quantity?: number | null) => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await addToWishlist(productId, variantId ?? null, quantity ?? 1);
        if (res.ok) router.push(res.redirect);
        else if (res.signIn) router.push(res.signIn);
        else setError(res.error);
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  };

  return { add, pending, error };
}
