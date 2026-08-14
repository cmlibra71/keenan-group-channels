"use client";

import Link from "next/link";
import { LogIn } from "lucide-react";
import { useHeaderPanels } from "@/lib/cart-quote-counts";
import { SIGN_IN_REQUIRED_MESSAGE } from "@/lib/checkout/account-required";

/**
 * The sign-in step a guest meets at checkout on a channel that does not allow
 * guest checkout (Industry Kitchens, as on Zoey — card LQM9FQYe). Chefs Depot
 * keeps guest checkout, so this never renders here; the component exists on both
 * sites so the two storefronts stay one codebase.
 *
 * The two buttons open the SAME account drawer the cart and the checkout contact
 * box already use, so signing in or registering here re-prices the basket
 * (card 7Yie3iPX) and leaves the shopper on /checkout, which re-renders with
 * their session and shows the real form. The plain link underneath is the
 * no-JavaScript way through: the full sign-in page, carrying /checkout as its
 * destination.
 */
export function CheckoutSignInGate() {
  const { open } = useHeaderPanels();

  return (
    <div className="mx-auto max-w-lg card p-8 text-center">
      <LogIn className="h-10 w-10 text-text-muted mx-auto" strokeWidth={1.5} />
      <h2 className="mt-4 text-lg font-semibold text-text-primary">Sign in to check out</h2>
      <p className="mt-2 body-text">{SIGN_IN_REQUIRED_MESSAGE}</p>
      <p className="mt-1 text-sm text-text-secondary">
        Your cart is saved. Signing in also applies your account pricing.
      </p>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => open("account", { view: "login", returnTo: "close" })}
          className="btn-primary w-full"
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => open("account", { view: "register", returnTo: "close" })}
          className="btn-secondary w-full"
        >
          Create an account
        </button>
      </div>

      <p className="mt-6 text-sm text-text-secondary">
        <Link href="/account?next=%2Fcheckout" className="text-text-primary font-medium hover:underline">
          Use the full sign-in page
        </Link>{" "}
        or{" "}
        <Link href="/cart" className="text-text-primary font-medium hover:underline">
          go back to your cart
        </Link>
        .
      </p>
    </div>
  );
}
