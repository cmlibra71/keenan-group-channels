"use client";

import { SlidePanel } from "@/components/ui/SlidePanel";
import { CartPanel } from "@/components/cart/CartPanel";
import { QuotePanel } from "@/components/quote/QuotePanel";
import { AccountPanel } from "@/components/account/AccountPanel";
import { useHeaderPanels } from "@/lib/cart-quote-counts";

/**
 * The ONE host for the header's slide-out panels. Rendered once per page as a
 * sibling of <header> (never inside a breakpoint-hidden wrapper, which would
 * display:none the panel at other widths), it reads the shared open state so
 * exactly one panel is ever visible — including on sites that render several
 * HeaderClient instances for different breakpoints.
 *
 * The `key={nonce}` remount is what makes a repeat add refresh an already-open
 * panel: CartPanel/QuotePanel load their contents on mount/open, so a fresh
 * mount re-reads the cart/quote without the panel closing and re-animating.
 *
 * It also carries the opener's INTENT into the account panel — which face to
 * show, the email already typed, and where the shopper goes once signed in. That
 * is what lets the cart drawer and the checkout page hand somebody to the
 * existing sign-in form and get them back where they were, on the same page.
 */
export function HeaderPanels() {
  const { panel, nonce, intent, open, close } = useHeaderPanels();

  // "Revert to the order": once they're signed in, drop the overlay (the
  // checkout page behind it has already re-rendered with their session) or
  // re-open the panel they came from, which re-reads itself at their prices.
  function handleAuthenticated() {
    const returnTo = intent?.returnTo;
    if (!returnTo) return;
    if (returnTo === "close") close();
    else open(returnTo);
  }

  return (
    <>
      {/* Quote panel */}
      <SlidePanel isOpen={panel === "quote"} onClose={close} title="Your Quote">
        <QuotePanel key={nonce} />
      </SlidePanel>

      {/* Cart panel */}
      <SlidePanel isOpen={panel === "cart"} onClose={close} title="Your Cart">
        <CartPanel key={nonce} />
      </SlidePanel>

      {/* Account panel — keyed like the others now that the cart drawer and
          checkout open it programmatically: a fresh mount is what applies the
          new intent (sign in vs create account, prefilled email). */}
      <SlidePanel isOpen={panel === "account"} onClose={close} title="Account">
        <AccountPanel
          key={nonce}
          initialView={intent?.view}
          initialEmail={intent?.email}
          onAuthenticated={handleAuthenticated}
        />
      </SlidePanel>
    </>
  );
}
