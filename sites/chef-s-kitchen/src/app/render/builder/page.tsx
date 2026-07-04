import { verifyRenderRequest } from "@/lib/cms-render";
import { getDesignTokens } from "@/lib/store";
import BuilderEditorClient from "@/components/builder/BuilderEditorClient";

// Chrome-free GrapesJS editor host, embedded in the portal via iframe. Lives
// under /render/* so proxy.ts tags it x-cms-render (bare shell) + sets the
// portal frame-ancestors CSP. Token-guarded (portal-minted, key=builder:<pageId>).
// The portal (which owns DB reads/writes) pushes the draft project in via
// postMessage builder:load and persists builder:save; this route only serves the
// editor + the design-token color swatches.
export const dynamic = "force-dynamic";

export default async function BuilderHostPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const claims = verifyRenderRequest(token ?? null);
  if (!claims || !claims.key?.startsWith("builder:")) {
    return (
      <div style={{ padding: 24, fontFamily: "sans-serif" }}>
        Invalid or expired builder token.
      </div>
    );
  }

  let tokenColors: { id: string; label: string; value: string }[] = [];
  try {
    const tokens = (await getDesignTokens()) as { colors?: Record<string, string> } | null;
    tokenColors = Object.keys(tokens?.colors ?? {}).map((k) => ({
      id: k,
      label: k,
      value: `var(--color-${k})`,
    }));
  } catch {
    /* tokens are optional for the editor */
  }

  return <BuilderEditorClient tokenColors={tokenColors} />;
}
