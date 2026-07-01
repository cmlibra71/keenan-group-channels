import "server-only";
import {
  verifyRenderToken,
  tokenSetToCssVars,
  cmsRenderSessionService,
  productService,
  categoryService,
  type RenderClaims,
  type RenderContext,
} from "@keenan/services";
import {
  getCmsPage,
  getCmsCategoryPage,
  getCmsTemplate,
  getDesignTokens,
  getDraftDesignTokens,
  getProducts,
  getProductBySlug,
  getCategoryBySlug,
  getTopCategories,
} from "@/lib/store";
import { CHANNEL_ID } from "@/lib/channel";
import type { RenderedBlock } from "@/blocks/BlockRenderer";

/**
 * Shared resolver behind the /render/cms/* surface: verifies the portal-minted
 * render token and assembles { blocks, context, tokenVars } for BlockRenderer.
 * Draft-first by design — the surface exists to show unpublished work.
 */

export interface ResolvedRender {
  blocks: RenderedBlock[];
  context: RenderContext;
  tokenVars: Record<string, string>;
}

export function verifyRenderRequest(token: string | null): RenderClaims | null {
  const secret = process.env.CMS_PREVIEW_SECRET;
  if (!secret) return null;
  const claims = verifyRenderToken(token, secret);
  if (!claims || claims.channelId !== CHANNEL_ID) return null;
  return claims;
}

/** The channel-scoped, sanitized product shape the product components expect. */
async function hydrateProduct(recordId?: number) {
  try {
    if (recordId) {
      const row = (await productService.getById(recordId)) as {
        url_path?: string | null;
        id: number;
      };
      const slug = row.url_path || String(row.id);
      return await getProductBySlug(slug);
    }
  } catch {
    // fall through to the fallback below
  }
  try {
    let { products } = await getProducts({ featured: true, limit: 1 });
    if (!products.length) ({ products } = await getProducts({ limit: 1 }));
    const first = products[0] as { url_path?: string | null; urlPath?: string | null; id: number } | undefined;
    if (!first) return null;
    return await getProductBySlug(first.url_path || first.urlPath || String(first.id));
  } catch {
    return null;
  }
}

async function hydrateCategory(recordId?: number) {
  try {
    if (recordId) {
      const row = (await categoryService.getById(recordId)) as { slug?: string | null };
      if (row?.slug) return await getCategoryBySlug(row.slug);
    }
  } catch {
    // fall through
  }
  try {
    const top = (await getTopCategories()) as Array<{ slug: string }>;
    if (!top.length) return null;
    return await getCategoryBySlug(top[0].slug);
  } catch {
    return null;
  }
}

async function contextFor(
  kind: "product" | "category" | null,
  recordId?: number
): Promise<RenderContext> {
  if (kind === "product") {
    const product = await hydrateProduct(recordId);
    return product
      ? { record: { kind: "product", product: product as Record<string, unknown> }, draft: true }
      : { draft: true };
  }
  if (kind === "category") {
    const category = await hydrateCategory(recordId);
    return category
      ? { record: { kind: "category", category: category as Record<string, unknown> }, draft: true }
      : { draft: true };
  }
  return { draft: true };
}

async function tokenVarsFor(claims: RenderClaims): Promise<Record<string, string>> {
  try {
    const tokens =
      claims.tokens === "draft" ? await getDraftDesignTokens() : await getDesignTokens();
    return tokenSetToCssVars(tokens);
  } catch {
    return {};
  }
}

/** mode "page": a cms_pages document read live from the DB (draft blocks). */
export async function resolvePageRender(claims: RenderClaims): Promise<ResolvedRender | null> {
  const key = claims.key;
  let doc: { blocks: Record<string, unknown>[] } | null = null;
  let recordKind: "product" | "category" | null = null;

  if (key === "home") {
    doc = await getCmsPage("home", true);
  } else if (key.startsWith("page:")) {
    doc = await getCmsPage(key.slice("page:".length), true);
  } else if (key.startsWith("category:")) {
    const categoryId = Number(key.slice("category:".length));
    if (Number.isInteger(categoryId)) {
      doc = await getCmsCategoryPage(categoryId, true);
      recordKind = "category";
      claims = { ...claims, recordId: claims.recordId ?? categoryId };
    }
  } else if (key === "template:product") {
    doc = await getCmsTemplate("product", true);
    recordKind = "product";
  } else if (key === "template:category_layout") {
    doc = await getCmsTemplate("category_layout", true);
    recordKind = "category";
  }

  if (!doc) return null;
  const [context, tokenVars] = await Promise.all([
    contextFor(recordKind, claims.recordId),
    tokenVarsFor(claims),
  ]);
  return { blocks: doc.blocks as unknown as RenderedBlock[], context, tokenVars };
}

/** mode "session": an ephemeral cms_render_sessions payload the portal wrote. */
export async function resolveSessionRender(claims: RenderClaims): Promise<ResolvedRender | null> {
  const payload = await cmsRenderSessionService.get(claims.key, CHANNEL_ID);
  if (!payload) return null;

  const blocks: RenderedBlock[] = (payload.blocks ?? []).map((b, i) => ({
    block_type: b.type,
    region: b.region ?? "main",
    position: i,
    props: b.props ?? {},
    is_visible: !("hidden" in b) || !b.hidden,
  }));

  const context = await contextFor(
    payload.recordContext?.kind ?? null,
    payload.recordContext?.id
  );

  // session payloads may carry their own draft tokens (design-system preview)
  const tokenVars = payload.draftTokens
    ? tokenSetToCssVars(payload.draftTokens)
    : await tokenVarsFor(claims);

  return { blocks, context, tokenVars };
}
