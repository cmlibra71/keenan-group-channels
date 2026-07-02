// ============================================================================
// BlockRenderer — maps stored CMS blocks to this fork's React components.
//
// Each fork owns its own block component map (registry.tsx) and may diverge.
// Resolution is by block_type; an unknown/unavailable type renders a labelled
// placeholder in draft/preview and NOTHING in production (never crashes a page).
//
// `context` carries the record a TEMPLATE document renders against (product /
// category) — the route fetches it once, system blocks read ctx.record instead
// of fetching per-block. Blocks whose registry def `requiresContext` isn't
// satisfied are skipped (placeholder in draft). Components receive { props, ctx };
// existing components that destructure only { props } are unaffected.
//
// `editHooks` (render surface only) wraps each block in a marker div the
// portal's canvas uses for click-to-select + scroll-into-view. The marker key
// is `${region}:${indexInRegion}` — stable across autosaves (draft rows are
// replaced wholesale, so DB ids are not).
// ============================================================================
import { BLOCK_REGISTRY, type RenderContext } from "@keenan/services";
import { BLOCK_COMPONENTS } from "./registry";

export interface RenderedBlock {
  block_type: string;
  region?: string;
  position?: number;
  props?: Record<string, unknown>;
  is_visible?: boolean;
}

function MissingBlock({ type, reason }: { type: string; reason?: string }) {
  return (
    <div className="mx-auto my-2 max-w-3xl rounded border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-700">
      Block <code className="font-mono">{type}</code>{" "}
      {reason ?? "is not available on this site."}
    </div>
  );
}

function contextSatisfies(
  requires: "product" | "category" | undefined,
  context: RenderContext | undefined
): boolean {
  if (!requires) return true;
  return context?.record?.kind === requires;
}

// Universal design-control consumption (props.design, validated against the
// registry's SECTION_DESIGN): background = a design-token colour behind the
// section, spacing_y = extra vertical space around it. Applied as a wrapper so
// EVERY block honours the portal's Design tab with no per-component work;
// absent/empty design renders exactly as before.
const SPACING_CLASS: Record<string, string> = {
  sm: "py-4",
  md: "py-10",
  lg: "py-20",
};

function designWrapperProps(
  props: Record<string, unknown> | undefined
): { style?: React.CSSProperties; className?: string } | null {
  const design = props?.design as
    | { spacing_y?: string; background?: string }
    | undefined;
  if (!design || typeof design !== "object") return null;
  const className = design.spacing_y ? SPACING_CLASS[design.spacing_y] : undefined;
  const style =
    design.background && /^[a-zA-Z0-9_-]+$/.test(design.background)
      ? { backgroundColor: `var(--color-${design.background})` }
      : undefined;
  if (!className && !style) return null;
  return { style, className };
}

export function BlockRenderer({
  blocks,
  draft = false,
  context,
  editHooks = false,
}: {
  blocks: RenderedBlock[];
  draft?: boolean;
  context?: RenderContext;
  editHooks?: boolean;
}) {
  const regionCounts: Record<string, number> = {};
  return (
    <>
      {blocks.map((block, i) => {
        const region = block.region ?? "main";
        const indexInRegion = regionCounts[region] ?? 0;
        regionCounts[region] = indexInRegion + 1;
        const markerKey = `${region}:${indexInRegion}`;

        const design = designWrapperProps(block.props);
        const wrap = (node: React.ReactNode) => {
          if (!editHooks && !design) return node;
          return (
            <div
              key={i}
              data-cms-block={editHooks ? markerKey : undefined}
              data-cms-block-type={editHooks ? block.block_type : undefined}
              style={design?.style}
              className={design?.className}
            >
              {node}
            </div>
          );
        };

        if (block.is_visible === false && !draft) return null;

        const def = BLOCK_REGISTRY[block.block_type];
        if (!contextSatisfies(def?.requiresContext, context)) {
          return draft
            ? wrap(
                <MissingBlock
                  key={editHooks ? undefined : i}
                  type={block.block_type}
                  reason={`needs a ${def?.requiresContext} to render.`}
                />
              )
            : null;
        }

        const Cmp = BLOCK_COMPONENTS[block.block_type];
        if (!Cmp) {
          return draft
            ? wrap(<MissingBlock key={editHooks ? undefined : i} type={block.block_type} />)
            : null;
        }
        return wrap(<Cmp key={editHooks ? undefined : i} props={block.props ?? {}} ctx={context} />);
      })}
    </>
  );
}
