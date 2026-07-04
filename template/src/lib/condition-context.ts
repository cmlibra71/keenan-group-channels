import "server-only";
import {
  EMPTY_CONDITION_CONTEXT,
  type ConditionContext,
  type RenderContext,
} from "@keenan/services";

/**
 * ConditionContext for CMS display rules — template/IK baseline. Record facts
 * come from the RenderContext; customer facts default to guest (this fork has
 * no member model on record pages yet) unless a render session simulates one.
 */
export async function buildConditionContext(ctx?: RenderContext): Promise<ConditionContext> {
  const base: ConditionContext = { ...EMPTY_CONDITION_CONTEXT };

  if (ctx?.record?.kind === "product") {
    const p = ctx.record.product as Record<string, unknown>;
    base.categoryIds = (p.categoryIds as number[]) ?? [];
    base.brandId = (p.brandId as number) ?? null;
    base.onSale = p.salePrice != null && p.salePrice !== "";
    base.clearance = base.onSale;
    const tracking = (p.inventoryTracking as string) ?? "none";
    base.inStock = tracking === "none" ? true : ((p.inventoryLevel as number) ?? 0) > 0;
    base.hasVariants = Array.isArray(p.variants) && (p.variants as unknown[]).length > 0;
    const price = Number(p.price);
    base.price = Number.isFinite(price) ? price : null;
  } else if (ctx?.record?.kind === "category") {
    const c = ctx.record.category as Record<string, unknown>;
    base.categoryIds = [
      ...(((c.path_ids as number[]) ?? (c.pathIds as number[])) ?? []),
      c.id as number,
    ].filter((n): n is number => typeof n === "number");
  }

  if (ctx?.simulatedCustomer) {
    base.signedIn = ctx.simulatedCustomer.signedIn ?? false;
    base.isMember = ctx.simulatedCustomer.member ?? false;
    base.customerGroupId = ctx.simulatedCustomer.customerGroupId ?? null;
  }

  return base;
}
