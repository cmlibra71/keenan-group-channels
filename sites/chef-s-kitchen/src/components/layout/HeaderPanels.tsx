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
 */
export function HeaderPanels() {
  const { panel, nonce, close } = useHeaderPanels();

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

      {/* Account panel — never auto-opened, so no remount key */}
      <SlidePanel isOpen={panel === "account"} onClose={close} title="Account">
        <AccountPanel />
      </SlidePanel>
    </>
  );
}
