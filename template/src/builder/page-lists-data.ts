import type { CardPricing, PageListDecl } from "@keenan/services/builder";
import { pickDeclared, toBlogCard } from "@keenan/services/builder";
import { applyChannelRulesToTileRows, channelRulesOfRow } from "@keenan/services/channel-rules";
import { getProductsByPaths, getBlogPostBySlug, attachFromPrices } from "@/lib/store";
import { applyAccountPrices, getListingMemberPrices, getPricingGroupId, getMemberContext } from "@/lib/member";
import { applyCatalogScope } from "@/lib/catalog-scope";
import { attachBrandLogosAlongside } from "@/lib/brand-logo-fallback";
import { promotionBadgeMap } from "@/lib/promotions/badges";
import { getSession } from "@/lib/auth";

// ============================================================================
// Data for a content page's declared lists (WP2-a product lists, WP2-o blog
// lists — builder/page-lists in services). ONE read for every product the page
// declares and one cached read per post, then the same per-viewer passes a
// category grid makes: catalog scope (hidden/exclusive products drop out),
// account prices, configurable "Starting From", brand-logo fallback, this
// storefront's Zoey channel rules, member prices and promotion badges.
// ============================================================================

type Row = Record<string, unknown>;

export async function loadPageLists(decls: readonly PageListDecl[]): Promise<{
  lists: { products: Record<string, Row[]>; blogs: Record<string, Row[]> };
  pricing: CardPricing;
}> {
  const productDecls = decls.filter((d) => d.kind === "products");
  const blogDecls = decls.filter((d) => d.kind === "blogs");
  const productPaths = [...new Set(productDecls.flatMap((d) => d.paths))];
  const postSlugs = [...new Set(blogDecls.flatMap((d) => d.paths))];

  const [rows, posts] = await Promise.all([
    productPaths.length ? getProductsByPaths(productPaths).catch(() => [] as Row[]) : Promise.resolve([] as Row[]),
    Promise.all(postSlugs.map((slug) => getBlogPostBySlug(slug).catch(() => null))),
  ]);

  let pricing: CardPricing = {};
  const productLists: Record<string, Row[]> = {};
  if (rows.length) {
    const visible = await applyCatalogScope(rows as unknown as { id: number }[]);
    const overlaid = (await attachBrandLogosAlongside(
      visible,
      (async () => attachFromPrices(await applyAccountPrices(visible), { pricingGroupId: await getPricingGroupId() }))()
    )) as unknown as Row[];
    const viewer = overlaid.some((r) => channelRulesOfRow(r)?.guestQuoteOnly)
      ? { loggedIn: (await getSession().catch(() => null)) != null }
      : null;
    const scoped = applyChannelRulesToTileRows(overlaid, { viewer }) as Row[];
    const [memberPriceMap, memberCtx, promoBadgeMap] = await Promise.all([
      scoped.length ? getListingMemberPrices(scoped as never).catch(() => ({})) : Promise.resolve({}),
      getMemberContext().catch(() => null),
      promotionBadgeMap(scoped as unknown as { id: number; sku?: string | null }[]).catch(() => ({})),
    ]);
    pricing = {
      memberPriceMap: memberPriceMap as Record<number, number>,
      isMember: memberCtx?.isMember ?? false,
      promoBadgeMap: promoBadgeMap as Record<number, string>,
    };
    const byPath = new Map(scoped.map((r) => [String(r.urlPath ?? r.url_path ?? ""), r]));
    for (const d of productDecls) productLists[d.key] = pickDeclared(d, byPath);
  }

  const blogLists: Record<string, Row[]> = {};
  if (blogDecls.length) {
    const bySlug = new Map(
      posts.filter((p): p is Row => !!p).map((p) => [String((p as Row).slug ?? ""), toBlogCard(p as Row)])
    );
    for (const d of blogDecls) blogLists[d.key] = pickDeclared(d, bySlug);
  }
  return { lists: { products: productLists, blogs: blogLists }, pricing };
}
