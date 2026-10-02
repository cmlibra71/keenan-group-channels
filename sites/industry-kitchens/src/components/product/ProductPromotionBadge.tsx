import { promotionBadgeMap } from "@/lib/promotions/badges";

/**
 * The Buy X Get Y / free-freight badge on a PRODUCT PAGE (card EIXdjw2s). Server component, placed
 * beside the carton-tier table on every product-page branch (node tree, CMS template, legacy) for
 * the same reason that table is: the live Industry Kitchens page takes the node-tree path, and a
 * badge on one branch only is a badge the next shopper does not see. Draws nothing when the
 * product is in no public offer — safe on every page.
 */
export async function ProductPromotionBadge({
  productId,
  sku,
}: {
  productId: number | null | undefined;
  sku: string | null | undefined;
}) {
  if (typeof productId !== "number" || !Number.isFinite(productId)) return null;
  const badges = await promotionBadgeMap([{ id: productId, sku: sku ?? null }]);
  const badge = badges[productId];
  if (!badge) return null;
  return (
    <div className="mt-6">
      <span className="badge-offer">{badge}</span>
    </div>
  );
}
