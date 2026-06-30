// ============================================================================
// BlockRenderer — maps stored CMS blocks to this fork's React components.
//
// Each fork owns its own block component map (registry.tsx) and may diverge.
// Resolution is by block_type; an unknown/unavailable type renders a labelled
// placeholder in draft/preview and NOTHING in production (never crashes a page).
// ============================================================================
import { BLOCK_COMPONENTS } from "./registry";

export interface RenderedBlock {
  block_type: string;
  region?: string;
  props?: Record<string, unknown>;
  is_visible?: boolean;
}

function MissingBlock({ type }: { type: string }) {
  return (
    <div className="mx-auto my-2 max-w-3xl rounded border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-700">
      Block <code className="font-mono">{type}</code> is not available on this site.
    </div>
  );
}

export function BlockRenderer({
  blocks,
  draft = false,
}: {
  blocks: RenderedBlock[];
  draft?: boolean;
}) {
  return (
    <>
      {blocks.map((block, i) => {
        if (block.is_visible === false && !draft) return null;
        const Cmp = BLOCK_COMPONENTS[block.block_type];
        if (!Cmp) {
          return draft ? <MissingBlock key={i} type={block.block_type} /> : null;
        }
        return <Cmp key={i} props={block.props ?? {}} />;
      })}
    </>
  );
}
