"use client";

// ============================================================================
// The SilverChef panel on the product page (card 6f47rFeT).
//
// Steve's card is a screenshot: the SilverChef logo sitting beside the price
// box with "Rent per Week: $641.99" and "Apply for Finance >" under it. Tim
// settled the numbers on 2026-08-11 — every product, both sites, worked out
// from the price that shopper is looking at, SKOPE products on SKOPE's own
// calculator.
//
// SEALED NATIVE, not an authored node subtree: the figure has to follow the
// LIVE purchase state (variant choice, member/contract price) and an authored
// tree cannot call the finance calculator. It is keyed `silverchef-panel` and
// placed by `builder/silverchef-node.ts`, so it lands on both storefronts'
// stored trees without anybody re-authoring a template.
//
// The arithmetic is NOT here — see lib/finance/product-finance.ts, which reads
// @keenan/services/finance, the same module the checkout buttons use.
// ============================================================================

import { useProductPurchase } from "@keenan/services/product-page";
import { useGst } from "@/lib/gst";
import { productFinanceOffer } from "@/lib/finance/product-finance";
import { useFinanceRates } from "@/lib/finance/finance-rates-context";

export function SilverChefPanel() {
  const purchase = useProductPurchase();
  // `pricesIncludeTax` is the CHANNEL's basis. `inclusive` — the shopper's
  // ex/inc GST switch — is deliberately NOT read: finance money is GST
  // inclusive whatever the switch says (Product Brief §3), so flipping it must
  // not move the weekly figure.
  const { pricesIncludeTax } = useGst();
  // This storefront's own rates (card 6GBlDtwf), resolved in the root layout.
  // The same pair the checkout button quotes — one product must not carry two
  // different weekly rents on two of our own screens.
  const rates = useFinanceRates();

  const sku = purchase.activeVariant?.sku ?? purchase.product.sku;
  // The BRAND decides alongside the SKU since Steve widened the SKOPE test
  // (2026-08-19): a SKOPE fridge coded `BB380X-2SW` says nothing in its SKU.
  // A variant never has its own brand — the brand belongs to the product.
  const offer = productFinanceOffer({
    price: {
      displayPrice: purchase.displayPrice,
      displaySalePrice: purchase.displaySalePrice,
      memberPrice: purchase.activeMemberPrice,
    },
    sku,
    brand: purchase.product.brandName ?? null,
    pricesIncludeTax,
    rates,
  });

  // No price to rent: the buy box is already offering a quote instead.
  //
  // NOTE, and it is a real gap rather than a decision: `products.hide_price`
  // (card 7vu2iEEZ) is not honoured anywhere on the storefront yet, so it
  // cannot be honoured here either — the purchase scope carries no such flag.
  // The weekly figure is the price divided by a constant, so the day that flag
  // starts working this panel is a SECOND place a hidden price would be
  // published and must hide with it. Recorded on `sf-product-page` in the
  // behaviour register so the card that builds it cannot miss this surface.
  if (!offer) return null;

  const isSkope = offer.funder === "skope";

  return (
    <div className="mt-4 flex items-center gap-4 rounded-[12px] border border-border bg-surface-primary px-4 py-3">
      {isSkope ? (
        <span className="shrink-0 text-sm font-semibold leading-tight text-text-primary">
          Skope
          <br />
          Funding
        </span>
      ) : (
        <img
          src="/silverchef-logo.png"
          alt="SilverChef"
          width={132}
          height={70}
          className="h-9 w-auto shrink-0"
          loading="lazy"
        />
      )}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-text-primary">{offer.text}</p>
        {/* Straight to the form (Steve's card: the button opens the finance
            form), and to THIS funder's form — a Skope offer opens Skope
            Funding's application, never SilverChef's (Steve, 2026-08-20). Both
            are coded routes on both sites, so this works whether that site's
            SilverChef information page is the CMS one (Industry Kitchens) or
            the coded fallback (Chefs Depot). */}
        <a
          href={offer.applyPath}
          className="mt-0.5 inline-flex items-center gap-1 text-sm text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
        >
          Apply for Finance <span aria-hidden="true">&rsaquo;</span>
        </a>
        <p className="mt-1 text-[11px] leading-snug text-text-muted">
          {isSkope
            ? "Skope Funding — indicative only, subject to approval."
            : "Indicative weekly rental, GST inclusive, subject to approval."}
        </p>
      </div>
    </div>
  );
}
