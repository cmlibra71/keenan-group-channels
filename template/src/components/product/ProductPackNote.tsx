"use client";

// ============================================================================
// "Carton contains 12 Pcs" — cards O108e4jH ("Product Edge Case - Qty Increment
// / Packaging") and zeMPVcA3 ("Pack Qty Items").
//
// Some products only ship by the carton. Zoey says so on its own product page,
// beside the quantity box, and prices a whole carton into the estimated
// subtotal: "Qty: 1 / Carton contains 12 Pcs", "Price @ 12 Pcs $6.41",
// "Estimated Subtotal $76.92". These storefronts said nothing at all, so a
// shopper read a per-piece price and expected to be able to buy one piece.
//
// WHAT IT STATES, and why both halves are here. The pack sentence alone leaves
// the reader multiplying a per-piece price by a number that is not on screen;
// the carton price alone hides what the per-piece price above it means. The
// money is per PIECE in our data (as it is in Zoey), so this multiplies the
// price the panel above it is ALREADY showing — the two cannot disagree, and
// nothing here charges anything.
//
// It is NOT stock or availability wording (CXnP1lrL): it is a packaging fact,
// true whether or not we hold any.
//
// Placement is a pure pass over the authored tree — `builder/product-pack-note.ts`
// — because both storefronts render this page from a tree stored in the
// database, so a coded page edit would ship nothing a customer can see.
// ============================================================================

import { useProductPurchaseOptional } from "@keenan/services/product-page";
import { packPrice } from "@keenan/services/pack";
import { Price } from "@/components/ui/Price";

export function ProductPackNote() {
  const purchase = useProductPurchaseOptional();
  if (!purchase) return null;
  const {
    packSize,
    packNote,
    packUnit,
    displayPrice,
    displaySalePrice,
    activeMemberPrice,
  } = purchase;
  if (packSize <= 1 || !packNote) return null;
  // The price this shopper is actually being shown: their member/contract price when it is the
  // one on the panel, else the sale price, else the list price.
  const shown = displaySalePrice ?? displayPrice;
  const unit = activeMemberPrice != null && activeMemberPrice < shown ? activeMemberPrice : shown;
  // NO PRICE ON SCREEN (card 7vu2iEEZ hides it per product, and the purchase scope masks it to 0):
  // the SENTENCE still has to be here. The quantity box on a pack product opens at a carton and
  // steps by a carton, and this line is the only thing that explains why — dropping it leaves an
  // affordance with no wording, which is the exact collision the behaviour register exists to
  // catch. What is dropped is the carton PRICE, which is the part that would leak the figure.
  return (
    <p className="mt-3 text-sm text-zinc-700">
      <span className="font-semibold text-zinc-900">{packNote}</span>
      {unit > 0 && (
        <>
          {" · "}
          <Price amount={packPrice(unit, packSize)} gst /> per {packUnit.toLowerCase()}
        </>
      )}
    </p>
  );
}

export default ProductPackNote;
