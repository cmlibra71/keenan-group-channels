import "server-only";
import { productVariantService, contactService, bulkPricingRuleService, getEffectivePrice, applyAdvertisedLadderPrices, getMemberLadderShare, boundPricesToMemberScale, getLadderConfig, CHANNEL_ID } from "@/lib/store";
import { resolveAccountLinePrices, accountLineKey } from "@keenan/services";
import { getAccountId } from "@/lib/member";
import { getFeatureFlag, getActiveSubscriptionForContact, shouldSuppressCatalogSalePrice, subscriptionPlanService, productService } from "@/lib/store";
import { getSession } from "@/lib/auth";
import { pickBestBulkUnit, layerCartPrice, memberPricingGroupId } from "@/lib/pricing/cart-pricing";

// ============================================================================
// THE PRICE ONE CART LINE STORES — moved here unchanged out of `lib/actions/cart.ts` (card
// Tc5ekvD6) so the product page can quote a bundle's components at EXACTLY the figure the cart
// will charge for them. It is not a "use server" module on purpose: every export of one of those
// is a public server action, and this reads prices for any product id it is handed. Its callers
// (the cart actions, and the product route pricing a bundle it has already checked is visible)
// own the visibility check.
// ============================================================================

/**
 * Best (lowest) per-unit price from a product's bulk pricing tiers for a given
 * quantity, or null if no tier applies. "price" tiers are an absolute per-unit
 * amount; "percent" tiers are a discount off the list (RRP) price — matching how
 * the PDP renders the Bulk Pricing table (ProductDetail.tsx). All current data is
 * "price", but percent is handled for forward-compatibility.
 */
async function bestBulkUnitPrice(productId: number, quantity: number, listPrice: number): Promise<number | null> {
  // listForParent is precisely typed (snake_case Row); tier matching is pure —
  // delegated to pickBestBulkUnit (lib/pricing/cart-pricing.ts).
  const result = await bulkPricingRuleService.listForParent(productId, {
    page: 1,
    limit: 100,
    sort: "quantity_min",
    direction: "asc",
  });
  return pickBestBulkUnit(result.data, quantity, listPrice);
}

/**
 * Resolve the prices to store for a cart line, for the GIVEN quantity. The
 * effective per-unit charge always flows through `salePrice` (list price stays
 * RRP), so the cart total, the cart display and checkout all read the same
 * number — guaranteeing charged == shown. Recomputed on every quantity change
 * because bulk tiers are quantity-dependent.
 *
 * Layers, best-price-wins:
 *   1. catalog sale price (the channel's public price; suppressed on member-only
 *      cost-plus channels like Chef's Depot, where RRP applies without a member),
 *   2. member (cost-plus) price for an active subscriber,
 *   3. bulk quantity-break tiers (only on channels that don't suppress the
 *      catalog — e.g. Industry Kitchens; these match the legacy site's tier pricing).
 */
export async function resolveItemPricing(
  productId: number,
  variantId: number | null | undefined,
  quantity: number
): Promise<{ listPrice: string; salePrice: string | null }> {
  const layered = await layerItemPricing(productId, variantId, quantity);
  // THE MEMBER PRICE SCALE'S BAND (card gk23c1VK). Whatever layer won — the
  // account's contract price included, which returns before any engine call —
  // a scale-priced line is held inside [Wholesale x 1.01, standard price]:
  // "no price, promotion or override ever goes below W x 1.01", "a customer-group
  // or contract price below W does not lower the floor", and nothing exceeds M.
  // A no-op (one cached settings read) with the scale off, which is every
  // channel until one is switched on.
  if ((await getLadderConfig().catch(() => null))?.enabled !== true) return layered;
  const bandVariantId = variantId ?? (await defaultVariantId(productId));
  return boundPricesToMemberScale(bandVariantId, layered).catch(() => layered);
}

/** The variant a variant-less line prices from: the product's lowest-id variant. */
async function defaultVariantId(productId: number): Promise<number | null> {
  const first = await productVariantService
    .listForParent(productId, { page: 1, limit: 1, sort: "id", direction: "asc" })
    .catch(() => null);
  return (first?.data[0] as { id: number } | undefined)?.id ?? null;
}

async function layerItemPricing(
  productId: number,
  variantId: number | null | undefined,
  quantity: number
): Promise<{ listPrice: string; salePrice: string | null }> {
  const product = (await productService.getById(productId)) as { price: string; sale_price: string | null } | null;
  if (!product) throw new Error("Product not found");

  // ── ACCOUNT CONTRACT PRICE: an unconditional override (Zoey: "takes priority over ALL other
  // Product prices"). Resolved BEFORE any layering, and returned directly — the catalogue sale
  // price, the member/cost-plus price and the bulk tiers below must not undercut or replace it.
  const accountId = await getAccountId();
  if (accountId) {
    const key = accountLineKey({ productId, variantId });
    const record = (
      await resolveAccountLinePrices(accountId, [{ productId, variantId }])
    ).get(key);
    if (record) return { listPrice: record.price, salePrice: record.salePrice };
  }

  let listPrice = product.price;
  // NOTE: getById returns snake_case — read sale_price (reading salePrice silently
  // yielded undefined, so IK was charging RRP instead of its public sale price).
  let catalogSalePrice: string | null = product.sale_price ?? null;

  if (variantId) {
    const variant = (await productVariantService.getById(variantId)) as { price: string | null; sale_price: string | null } | null;
    if (variant?.price) listPrice = variant.price;
    if (variant?.sale_price) catalogSalePrice = variant.sale_price;
  }

  // ── THE ADVERTISED PRICE (card gk23c1VK). On a channel whose buying-group
  // ladder advertises the Industry Kitchens trade price, the cart's list price
  // is M — the same figure the product page and the listing card showed. A cart
  // that re-derived RRP here would charge a price the shopper never saw, which
  // is the exact failure the "cart lines store their price at ADD time" rule
  // exists to prevent. No-op on a channel with no ladder switched on.
  {
    const [row] = await applyAdvertisedLadderPrices([
      {
        id: productId,
        price: listPrice,
        ...(variantId ? { variants: [{ id: variantId, price: listPrice }] } : {}),
      },
    ]);
    const advertised =
      (row as { variants?: Array<{ price?: unknown }> }).variants?.[0]?.price ??
      (row as { price?: unknown }).price;
    if (typeof advertised === "string" && parseFloat(advertised) > 0) listPrice = advertised;
  }

  // Channels with member-only cost-plus pricing suppress the shared catalog sale
  // price (it's another channel's public price) AND bulk tiers — list price stays RRP.
  const suppress = await shouldSuppressCatalogSalePrice();

  // Member (cost-plus) price for an active subscriber, if member pricing is enabled.
  let memberSalePrice: string | null = null;
  const memberPricingEnabled = await getFeatureFlag("member_pricing_enabled");
  if (memberPricingEnabled) {
    const session = await getSession();
    if (session) {
      const activeSub = await getActiveSubscriptionForContact(session.contactId);
      if (activeSub) {
        const contact = (await contactService.getById(session.contactId)) as { customer_group_id: number | null } | null;
        // THE MEMBER'S PRICING GROUP — their own, else the one their membership's PLAN grants
        // (card avihBwqi). A membership belongs to the BUSINESS, so a colleague at a member
        // business is a member without ever having subscribed, and only the subscribe flow
        // stamps a customer group on a person. Reading the contact's own group alone priced
        // the product page as a member (`member-policy.ts` resolves
        // `contactGroupId ?? basePlanGroupId`) and charged this cart RRP — one price shown,
        // another charged, on exactly the population this card creates.
        const plan = (await subscriptionPlanService.getById(
          Number((activeSub as { plan_id: number }).plan_id)
        )) as { member_customer_group_id: number | null } | null;
        const memberGroupId = memberPricingGroupId(
          contact?.customer_group_id,
          plan?.member_customer_group_id
        );
        if (memberGroupId) {
          const variantResult = variantId ? null : await productVariantService.listForParent(productId, { page: 1, limit: 1, sort: "id", direction: "asc" });
          const pricingVariantId = variantId || (variantResult?.data[0] as { id: number } | undefined)?.id;
          if (pricingVariantId) {
            // The member's position on the Chefs Depot price scale, resolved the
            // same way every other pricing surface resolves it. Null off-scale.
            const ladderShare = await getMemberLadderShare({
              accountId,
              contactId: session.contactId,
            }).catch(() => null);
            const pricing = await getEffectivePrice(
              pricingVariantId,
              CHANNEL_ID,
              memberGroupId,
              quantity,
              // accountId is deliberately NOT passed. The account's own contract
              // prices are resolved separately above (`resolveAccountLinePrices`)
              // and take priority over everything; handing them to the engine here
              // too would be a second, unannounced pricing path on sf-cart for both
              // storefronts, which is not what this card is for. The scale needs
              // only the member's share.
              null,
              null,
              ladderShare
            );
            if (pricing.salePrice) memberSalePrice = pricing.salePrice;
          }
        }
      }
    }
  }

  // Bulk (quantity-break) tiers — only where the catalog isn't suppressed.
  const bulkUnit = suppress ? null : await bestBulkUnitPrice(productId, quantity, parseFloat(listPrice));

  // Layer the sources, best-price-wins (pure — see lib/pricing/cart-pricing.ts).
  return layerCartPrice({ listPrice, catalogSalePrice, suppress, memberSalePrice, bulkUnit });
}
