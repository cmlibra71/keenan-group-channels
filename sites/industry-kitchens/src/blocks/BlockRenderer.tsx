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
import { GenericTemplatableBlock, blockRendersV2 } from "./TemplatableBlock";

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

        // CMS v2.1: generic code-editable path — every templatable grid block
        // renders its sub-block templates when the doc carries them (or in any
        // draft/editor context). selfManagedV2 blocks keep their own component.
        if (blockRendersV2(def, block.props, context)) {
          return wrap(
            <GenericTemplatableBlock
              key={editHooks ? undefined : i}
              type={block.block_type}
              props={block.props ?? {}}
              ctx={context}
              editHooks={editHooks}
              blockMarker={markerKey}
            />
          );
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

// ============================================================================
// SubBlockRenderer (CMS v2) — renders a templatable block's sub-blocks:
// KTL templates + locked widgets in a responsive grid (props.layout), each
// sub-block condition-gated and edit-marked. Fork block components (e.g.
// product_overview) call this AFTER building binding data + the condition
// context, wrapped in whatever state provider the widgets need.
//
// Kill switch: CMS_V2_DISABLED=1 makes this return null — callers fall back
// to their legacy compiled component.
// ============================================================================
import {
  containerLayoutToClasses,
  itemLayoutToClasses,
  evaluateConditions,
  sanitizeConditions,
  getSeedTemplate,
  type ConditionContext,
  type SubBlockInstance,
  type SubBlockSchemaEntry,
  type ContainerLayout,
  type ItemLayout,
} from "@keenan/services";
import { TemplateRenderer } from "./TemplateRenderer";
import { WIDGETS } from "./widgets";

export interface SubBlockRenderProps {
  /** the block's stored props (subBlocks/layout read from here) */
  props: Record<string, unknown>;
  /** dev-defined decomposition — used when props.subBlocks is absent/empty */
  schema?: SubBlockSchemaEntry[];
  /** container layout fallback when props.layout is absent (def.defaultProps.layout) */
  defaultLayout?: Record<string, unknown>;
  /** seed-template key prefix is embedded in schema entries; channelKey resolves them */
  channelKey: string;
  data: Record<string, unknown>;
  ctx?: RenderContext;
  condCtx: ConditionContext;
  draft?: boolean;
  editHooks?: boolean;
  /** parent block marker ("region:index") for sub-block edit markers */
  blockMarker?: string;
  resolvePartial?: Parameters<typeof TemplateRenderer>[0]["resolvePartial"];
}

/** Materialize the effective sub-block list: stored props win; otherwise the
 *  schema seeds (with per-channel seed templates) render the default design. */
export function effectiveSubBlocks(
  props: Record<string, unknown>,
  schema: SubBlockSchemaEntry[] | undefined,
  channelKey: string
): SubBlockInstance[] {
  const stored = props.subBlocks;
  if (Array.isArray(stored) && stored.length > 0) {
    return stored as SubBlockInstance[];
  }
  return (schema ?? []).map((entry) => ({
    id: `schema-${entry.key}`,
    key: entry.key,
    kind: entry.kind,
    label: entry.label,
    template:
      entry.kind === "template" && entry.seedTemplate
        ? getSeedTemplate(channelKey, entry.seedTemplate) ?? ""
        : undefined,
    widget: entry.widget ? { name: entry.widget.name, attrs: entry.widget.attrs } : undefined,
    layout: entry.defaultLayout,
    group: entry.defaultGroup,
  }));
}

export function SubBlockRenderer({
  props,
  schema,
  defaultLayout,
  channelKey,
  data,
  ctx,
  condCtx,
  draft = false,
  editHooks = false,
  blockMarker,
  resolvePartial,
}: SubBlockRenderProps) {
  if (process.env.CMS_V2_DISABLED === "1") return null;

  const subBlocks = effectiveSubBlocks(props, schema, channelKey);
  if (subBlocks.length === 0) return null;

  const schemaByKey = new Map((schema ?? []).map((s) => [s.key, s]));
  const containerClasses = containerLayoutToClasses(
    (props.layout as ContainerLayout | undefined) ?? (defaultLayout as ContainerLayout | undefined)
  ).join(" ");

  const renderContent = (sb: SubBlockInstance): React.ReactNode => {
    const schemaEntry = schemaByKey.get(sb.key);
    if (sb.kind === "widget" && sb.widget) {
      const Widget = WIDGETS[sb.widget.name];
      return Widget ? (
        <Widget attrs={sb.widget.attrs ?? {}} ctx={ctx} />
      ) : draft ? (
        <div className="rounded border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          widget “{sb.widget.name}” isn’t available on this site
        </div>
      ) : null;
    }
    if (sb.kind === "template") {
      return (
        <TemplateRenderer
          template={sb.template ?? ""}
          data={data}
          ctx={ctx}
          seedKey={schemaEntry?.seedTemplate}
          channelKey={channelKey}
          resolvePartial={resolvePartial}
          draft={draft}
        />
      );
    }
    return null;
  };

  const itemClassesFor = (sb: SubBlockInstance): string =>
    itemLayoutToClasses(
      (sb.layout as ItemLayout | undefined) ??
        (schemaByKey.get(sb.key)?.defaultLayout as ItemLayout | undefined)
    ).join(" ");

  // Partition into cells: CONSECUTIVE sub-blocks sharing a `group` share ONE
  // grid cell (stacked in flow — reproduces e.g. the legacy sticky buy column).
  type Cell = { group: string | null; members: Array<{ sb: SubBlockInstance; index: number }> };
  const cells: Cell[] = [];
  subBlocks.forEach((sb, index) => {
    if (sb.hidden && !draft) return;
    if (!evaluateConditions(sanitizeConditions(sb.conditions), condCtx)) return;
    const group = sb.group ?? null;
    const last = cells[cells.length - 1];
    if (group && last && last.group === group) {
      last.members.push({ sb, index });
    } else {
      cells.push({ group, members: [{ sb, index }] });
    }
  });

  return (
    <div className={containerClasses}>
      {cells.map((cell, c) => {
        const lead = cell.members[0].sb;
        const cellClasses = itemClassesFor(lead);
        const rendered = cell.members
          .map(({ sb, index }) => {
            const content = renderContent(sb);
            if (content == null) return null;
            return (
              <div
                key={sb.id || index}
                className={sb.hidden && draft ? "opacity-40" : undefined}
                data-cms-subblock={
                  editHooks && blockMarker ? `${blockMarker}:${index}` : undefined
                }
                data-cms-subblock-key={editHooks ? sb.key : undefined}
              >
                {content}
              </div>
            );
          })
          .filter(Boolean);
        if (rendered.length === 0) return null;
        return (
          <div key={cell.group ?? lead.id ?? c} className={cellClasses}>
            {rendered}
          </div>
        );
      })}
    </div>
  );
}
