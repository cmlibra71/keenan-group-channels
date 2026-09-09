import "server-only";

// ============================================================================
// GenericTemplatableBlock (CMS v2.1) — the universal code-editable render path.
//
// Any registry block with `templatable: true`, grid composition and no
// selfManagedV2 flag renders here instead of its compiled component when the
// doc carries edited sub-blocks OR the context is a draft/editor surface (so
// the editor's preview always matches the sections panel). Live pages keep
// the legacy compiled component until a doc actually carries subBlocks.
//
// Data: props.* = the block's own fields merged over registry defaults (the
// "variables"); context bindings (product/category/brand) from binding-data;
// provider lists (brands, categories, membership…) from ./block-data.
// ============================================================================

import {
  BLOCK_REGISTRY,
  blockSeedsResolve,
  type BlockTypeDefinition,
  type RenderContext,
} from "@keenan/services";
import { SubBlockRenderer } from "./BlockRenderer";
import { buildBindingData } from "./binding-data";
import { blockData } from "./block-data";
import { buildPartialResolver, CHANNEL_KEY } from "./partials";
import { buildConditionContext } from "@/lib/condition-context";

function hasStoredSubBlocks(props: Record<string, unknown> | undefined): boolean {
  return Array.isArray(props?.subBlocks) && (props!.subBlocks as unknown[]).length > 0;
}

/**
 * The single v2 gate: doc opted in, OR any draft/editor surface, OR forced —
 * and, when the doc has NOT opted in, only where this fork can actually draw the
 * block's default design.
 *
 * That last clause is card PukVI53u. With no stored `subBlocks` the default
 * design comes from the registry's schema seeds, and a seed missing for this
 * fork is not an error anybody sees: `effectiveSubBlocks` hands the renderer an
 * empty template, an empty template compiles to zero segments and throws
 * nothing, so TemplateRenderer's seed/legacy fallback never fires and the block
 * renders as NOTHING. Industry Kitchens had no `block/content_page` seed, so
 * every one of its 79 imported information pages showed an empty card in the
 * portal's canvas — Steve's "does not provide any apparent content when looking
 * at it in the site CMS backend". IK is still seedless for thirteen other
 * blocks, so the gate asks the question rather than the fix being one seed.
 *
 * Falling back means the fork's COMPILED component draws it, which is what the
 * live page already shows — so the editor canvas and the site agree. A doc that
 * carries stored sub-blocks is unaffected: the stored template is the design,
 * seed or no seed.
 */
export function blockRendersV2(
  def: BlockTypeDefinition | undefined,
  props: Record<string, unknown> | undefined,
  ctx: RenderContext | undefined
): boolean {
  if (!def?.templatable || def.selfManagedV2) return false;
  if ((def.composition ?? "grid") !== "grid") return false;
  if (process.env.CMS_V2_DISABLED === "1") return false;
  if (hasStoredSubBlocks(props)) return true;
  if (!blockSeedsResolve(def, CHANNEL_KEY)) return false;
  return ctx?.draft === true || process.env.CMS_V2_FORCE === "1";
}

export async function GenericTemplatableBlock({
  type,
  props,
  ctx,
  editHooks = false,
  blockMarker,
}: {
  type: string;
  props: Record<string, unknown>;
  ctx?: RenderContext;
  editHooks?: boolean;
  blockMarker?: string;
}) {
  const def = BLOCK_REGISTRY[type];
  if (!def) return null;

  const [condCtx, resolvePartial, extra] = await Promise.all([
    buildConditionContext(ctx),
    buildPartialResolver(ctx),
    blockData(type, props, ctx).catch(() => ({}) as Record<string, unknown>),
  ]);

  const mergedProps = {
    ...def.defaultProps,
    ...props,
    ...((extra.props as Record<string, unknown>) ?? {}),
  };
  const { props: _extraProps, ...extraData } = extra;
  void _extraProps;

  const data: Record<string, unknown> = {
    ...buildBindingData(ctx),
    ...extraData,
    props: mergedProps,
  };

  return (
    <SubBlockRenderer
      props={props}
      schema={def.subBlockSchema}
      defaultLayout={def.defaultProps?.layout as Record<string, unknown> | undefined}
      channelKey={CHANNEL_KEY}
      data={data}
      ctx={ctx}
      condCtx={condCtx}
      draft={ctx?.draft ?? false}
      editHooks={editHooks}
      blockMarker={blockMarker}
      resolvePartial={resolvePartial}
    />
  );
}
