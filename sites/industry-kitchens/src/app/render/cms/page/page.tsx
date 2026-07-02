import { BlockRenderer } from "@/blocks/BlockRenderer";
import { RenderBridge } from "@/blocks/render-bridge";
import { verifyRenderRequest, resolvePageRender } from "@/lib/cms-render";

export const dynamic = "force-dynamic";

/**
 * Chrome-free render surface for a cms_pages DOCUMENT (draft blocks, read live
 * from the DB) — the portal's page-builder canvas and design-system preview
 * embed this in an iframe. Token-guarded (RenderClaims mode "page"); the root
 * layout returns a bare shell for /render/* (x-cms-render, see src/proxy.ts).
 *
 * key: "home" | "page:<slug>" | "category:<id>" | "template:product"
 *      | "template:category_layout"
 */
export default async function RenderCmsPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const claims = verifyRenderRequest(token ?? null);
  if (!claims || claims.mode !== "page") {
    return (
      <div className="p-8 text-center text-sm text-zinc-500">
        Preview link is invalid or has expired. Close and reopen the editor to refresh it.
      </div>
    );
  }

  const resolved = await resolvePageRender(claims);
  if (!resolved) {
    return (
      <div className="p-8 text-center text-sm text-zinc-500">
        Nothing to render yet — this document has no draft content.
      </div>
    );
  }

  return (
    <div style={resolved.tokenVars as React.CSSProperties}>
      <RenderBridge />
      <BlockRenderer
        blocks={resolved.blocks}
        draft
        context={resolved.context}
        editHooks
      />
    </div>
  );
}
