import { BlockRenderer } from "@/blocks/BlockRenderer";
import { RenderBridge } from "@/blocks/render-bridge";
import { verifyRenderRequest, resolveSessionRender } from "@/lib/cms-render";

export const dynamic = "force-dynamic";

/**
 * Chrome-free render surface for an EPHEMERAL payload (cms_render_sessions row
 * the portal wrote): component-library previews, unsaved single-block previews,
 * design-token draft previews. Token-guarded (RenderClaims mode "session",
 * key = session id — the token binds to exactly one session).
 */
export default async function RenderCmsSession({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ id }, { token }] = await Promise.all([params, searchParams]);
  const claims = verifyRenderRequest(token ?? null);
  if (!claims || claims.mode !== "session" || claims.key !== id) {
    return (
      <div className="p-8 text-center text-sm text-zinc-500">
        Preview link is invalid or has expired. Close and reopen the editor to refresh it.
      </div>
    );
  }

  const resolved = await resolveSessionRender(claims);
  if (!resolved) {
    return (
      <div className="p-8 text-center text-sm text-zinc-500">
        This preview has expired — regenerate it from the portal.
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
