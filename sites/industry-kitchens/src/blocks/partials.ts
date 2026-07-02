import "server-only";

// ============================================================================
// Partial resolution (CMS v2) — shared editable KTL fragments (cms_partials)
// rendered via {{> key}} or by widgets (product_grid's card).
//
// Resolution order per request:
//   1. ctx.draftPartials  — the portal partial editor's live preview override
//   2. published cms_partials for THIS channel (cached 60s per server)
//   3. the dev-extracted seed (partial/<key>) — a partial can never 404 a page
// ============================================================================

import { cmsPartialService, getSeedTemplate, parseKtl, type KtlNode } from "@keenan/services";
import type { RenderContext } from "@keenan/services";
import { CHANNEL_ID } from "@/lib/channel";

// channelKey drives which seed generation backs missing partials. Prefer the
// explicit env; fall back to the well-known CHANNEL_ID mapping so a fork
// without CHANNEL_KEY set still seeds ITS OWN design, not the template's.
const CHANNEL_KEY =
  process.env.CHANNEL_KEY ??
  ({ 1: "industry-kitchens", 2: "chef-s-kitchen" } as Record<number, string>)[CHANNEL_ID] ??
  "template";

let publishedCache: { at: number; map: Record<string, string> } | null = null;
const PUBLISHED_TTL_MS = 60_000;

async function publishedPartials(): Promise<Record<string, string>> {
  const now = Date.now();
  if (publishedCache && now - publishedCache.at < PUBLISHED_TTL_MS) return publishedCache.map;
  try {
    const map = await cmsPartialService.publishedMapForChannel(CHANNEL_ID);
    publishedCache = { at: now, map };
    return map;
  } catch {
    return publishedCache?.map ?? {};
  }
}

/** The KTL source for a partial (draft override → published → seed). */
export async function getPartialSource(
  key: string,
  ctx?: RenderContext
): Promise<string | null> {
  const draft = ctx?.draftPartials?.[key];
  if (typeof draft === "string" && draft.length > 0) return draft;
  const published = (await publishedPartials())[key];
  if (typeof published === "string" && published.length > 0) return published;
  return getSeedTemplate(CHANNEL_KEY, `partial/${key}`);
}

/** Build the sync resolvePartial callback TemplateRenderer consumes for
 *  {{> key}} references. Fetches ALL sources up front (async), parses lazily
 *  with a per-call memo. */
export async function buildPartialResolver(
  ctx?: RenderContext
): Promise<(name: string) => KtlNode[] | null> {
  const published = await publishedPartials();
  const drafts = ctx?.draftPartials ?? {};
  const memo = new Map<string, KtlNode[] | null>();
  return (name: string) => {
    if (memo.has(name)) return memo.get(name)!;
    const source =
      (typeof drafts[name] === "string" && drafts[name]) ||
      (typeof published[name] === "string" && published[name]) ||
      getSeedTemplate(CHANNEL_KEY, `partial/${name}`);
    let ast: KtlNode[] | null = null;
    if (source) {
      try {
        ast = parseKtl(source);
      } catch {
        ast = null; // a broken partial renders as nothing, never crashes the page
      }
    }
    memo.set(name, ast);
    return ast;
  };
}
