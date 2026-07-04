import "server-only";
import {
  EMPTY_CONDITION_CONTEXT,
  type ConditionContext,
  type RenderContext,
} from "@keenan/services";
import { getSession } from "@/lib/auth";
import { getMemberContext } from "@/lib/member";

/**
 * Build the per-request ConditionContext CMS v2 display rules evaluate
 * against. Record facts come from the RenderContext (cache-safe); customer
 * facts read the session — callers that care about caching should only invoke
 * this when the document actually carries customer rules
 * (docHasCustomerConditions). Product pages are already per-request.
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

  // Preview-as (render surfaces): the portal's simulated customer wins —
  // there is no real storefront session on the render surface anyway.
  if (ctx?.simulatedCustomer) {
    base.signedIn = ctx.simulatedCustomer.signedIn ?? false;
    base.isMember = ctx.simulatedCustomer.member ?? false;
    base.customerGroupId = ctx.simulatedCustomer.customerGroupId ?? null;
    return base;
  }

  try {
    const [session, memberCtx] = await Promise.all([
      getSession().catch(() => null),
      getMemberContext().catch(() => null),
    ]);
    base.signedIn = session != null;
    base.isMember = memberCtx?.isMember ?? false;
    base.customerGroupId = memberCtx?.customerGroupId ?? null;
  } catch {
    // guest defaults stand
  }

  return base;
}
