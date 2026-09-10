"use client";

// ============================================================================
// "You may have selected a commercial appliance" — card HMtUxvwZ, merged in from
// the "Residential Address pop-up" card.
//
// THE WORDING IS THE CARD'S and is reproduced verbatim from
// `@keenan/services/residential`. Do not paraphrase it here.
//
// WHAT MAKES IT APPEAR. A cart line whose product carries "Not available for
// residential purchase" (`products.restrict_residential_purchase`). The card asks
// for it "when the item has a plug or cord", which is not something the catalogue
// records for any product; the commercial-only tick is the one signal we hold that
// means "this is commercial equipment, not a domestic one", and it is set by the
// same person, on the same screen, for the same reason. Assumed, and said so on
// the card.
//
// IT REFUSES NOTHING. It is shown once when the checkout opens, it can be
// dismissed, and Place Order is never disabled by it — this is a note about how
// the appliance behaves, not a condition of sale. There is deliberately no
// counterpart inside `placeOrder`: the "every filter on the page is duplicated in
// the action" rule (checkout-freight.md > sf-checkout) is about REFUSALS, and this
// is not one.
//
// It is dismissed per browser tab, not remembered: a shopper who reloads the
// checkout is reading the page again, and a note about equipment they are about to
// pay for is worth showing again.
//
// IT IS A REAL MODAL, NOT A DIV THAT SAYS role="dialog". It sits over the whole
// checkout on the critical path, so on a phone it is the first thing between the
// shopper and Pay Now: Escape closes it, focus starts on the acknowledge button, and
// Tab cannot walk out of it onto the payment form behind. A dialog you can only
// leave by finding one button with a mouse is a dead end for anyone on a keyboard.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import {
  COMMERCIAL_APPLIANCE_NOTICE,
  COMMERCIAL_APPLIANCE_NOTICE_HEADING,
} from "@keenan/services/residential";

export function CommercialApplianceNotice({ productNames }: { productNames: string[] }) {
  const [dismissed, setDismissed] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const shown = productNames.length > 0 && !dismissed;

  // Hooks run unconditionally; the early return is below them.
  useEffect(() => {
    if (!shown) return;
    buttonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setDismissed(true);
        return;
      }
      // The dialog holds exactly one focusable control, so the trap is simply
      // "keep it" — no first/last bookkeeping to drift out of date.
      if (event.key === "Tab") {
        event.preventDefault();
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [shown]);

  if (!shown) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={COMMERCIAL_APPLIANCE_NOTICE_HEADING}
      data-testid="commercial-appliance-notice"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-zinc-900">
          {COMMERCIAL_APPLIANCE_NOTICE_HEADING}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-700">
          {COMMERCIAL_APPLIANCE_NOTICE}
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-600">
          {productNames.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
        <button
          type="button"
          ref={buttonRef}
          onClick={() => setDismissed(true)}
          className="mt-5 w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          I understand
        </button>
      </div>
    </div>
  );
}

export default CommercialApplianceNotice;
