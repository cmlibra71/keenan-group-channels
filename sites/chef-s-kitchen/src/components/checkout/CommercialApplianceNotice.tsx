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
// TOKENS. This file is deliberately NOT byte-shared with template/: Chefs Depot's
// checkout speaks `steel-*`/`ink-*` and Industry Kitchens speaks `zinc-*`, so a
// shared copy would look borrowed on one of the two. Only the wording is shared, and
// that lives in `@keenan/services/residential`.
//
// It is dismissed per browser tab, not remembered: a shopper who reloads the
// checkout is reading the page again, and a note about equipment they are about to
// pay for is worth showing again.
// ============================================================================

import { useState } from "react";
import {
  COMMERCIAL_APPLIANCE_NOTICE,
  COMMERCIAL_APPLIANCE_NOTICE_HEADING,
} from "@keenan/services/residential";

export function CommercialApplianceNotice({ productNames }: { productNames: string[] }) {
  const [dismissed, setDismissed] = useState(false);
  if (productNames.length === 0 || dismissed) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={COMMERCIAL_APPLIANCE_NOTICE_HEADING}
      data-testid="commercial-appliance-notice"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-ink-900">
          {COMMERCIAL_APPLIANCE_NOTICE_HEADING}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-700">
          {COMMERCIAL_APPLIANCE_NOTICE}
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-steel-500">
          {productNames.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="mt-5 w-full rounded-md bg-ink-900 px-4 py-2 text-sm font-medium text-white hover:bg-ink-800"
        >
          I understand
        </button>
      </div>
    </div>
  );
}

export default CommercialApplianceNotice;
