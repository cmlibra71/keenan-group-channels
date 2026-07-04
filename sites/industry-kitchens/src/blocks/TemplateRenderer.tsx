// ============================================================================
// TemplateRenderer — renders a KTL template (CMS v2 editable block code) into
// React, splicing this fork's locked WIDGETS between sanitized HTML.
//
// Pipeline (see @keenan/services cms/template for the engine):
//   1. compile (LRU-cached AST)  2. evaluate → segments
//   3. assemble ONE html string with inert sentinels where widgets/rich
//      bindings go  4. sanitize the whole string (sanitizeKtlHtml — keeps
//      author markup wrapping widgets balanced)  5. html-react-parser builds
//      the React tree, replacing sentinels with widget components (SSR'd) and
//      RichContent (sanitize + stripStyles + {{code}} commands) for rich.
//
// Failure model (a bad template can never crash a live page): compile/eval
// errors fall back to the SEED template (dev-extracted markup shipped in the
// package); if that fails too, the caller's legacy component path takes over
// (SubBlockRenderer) — and draft surfaces show a labelled error card.
// ============================================================================
import parse, { Element, type DOMNode, domToReact } from "html-react-parser";
import {
  parseKtl,
  evaluateKtl,
  getSeedTemplate,
  type KtlNode,
  type KtlSegment,
  type RenderContext,
} from "@keenan/services";
import { sanitizeKtlHtml } from "@/lib/sanitize-html";
import { RichContent } from "@/components/content/RichContent";
import { WIDGETS } from "./widgets";

// ── compile cache (per server process; templates are content-addressed) ─────
const AST_CACHE = new Map<string, KtlNode[]>();
const AST_CACHE_MAX = 500;

function compileCached(template: string): KtlNode[] {
  const hit = AST_CACHE.get(template);
  if (hit) return hit;
  const ast = parseKtl(template);
  if (AST_CACHE.size >= AST_CACHE_MAX) {
    const first = AST_CACHE.keys().next().value;
    if (first !== undefined) AST_CACHE.delete(first);
  }
  AST_CACHE.set(template, ast);
  return ast;
}

export interface TemplateRenderProps {
  /** the stored KTL source (draft or published) */
  template: string;
  /** binding data (fork binding-data.ts builds this from RenderContext) */
  data: Record<string, unknown>;
  ctx?: RenderContext;
  /** seed-template key for the fallback chain (e.g. "product/title_meta") */
  seedKey?: string;
  channelKey?: string;
  /** pre-parsed partial resolver (Phase 3 wires cms_partials through this) */
  resolvePartial?: (name: string) => KtlNode[] | null;
  draft?: boolean;
}

function renderSegments(
  segments: KtlSegment[],
  ctx: RenderContext | undefined,
  draft: boolean
): React.ReactNode {
  const widgets: Array<{ name: string; attrs: Record<string, unknown> }> = [];
  const riches: string[] = [];
  let html = "";
  for (const segment of segments) {
    if (segment.kind === "html") {
      html += segment.html;
    } else if (segment.kind === "rich") {
      html += `<ktl-rich data-r="${riches.length}"></ktl-rich>`;
      riches.push(segment.html);
    } else {
      html += `<ktl-w data-w="${widgets.length}"></ktl-w>`;
      widgets.push({ name: segment.name, attrs: segment.attrs });
    }
  }

  const clean = sanitizeKtlHtml(html);

  return parse(clean, {
    replace: (node: DOMNode) => {
      if (!(node instanceof Element)) return undefined;
      if (node.name === "ktl-w") {
        const idx = Number(node.attribs["data-w"]);
        const ref = widgets[idx];
        if (!ref) return <></>;
        const Widget = WIDGETS[ref.name];
        if (!Widget) {
          return draft ? (
            <span className="inline-block rounded border border-dashed border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-700">
              widget “{ref.name}” isn’t available on this site
            </span>
          ) : (
            <></>
          );
        }
        return <Widget attrs={ref.attrs} ctx={ctx} />;
      }
      if (node.name === "ktl-rich") {
        const idx = Number(node.attribs["data-r"]);
        const richHtml = riches[idx];
        if (richHtml == null) return <></>;
        // RichContent = the legacy rich-field pipeline: sanitize, strip legacy
        // inline styles, repair unclosed tags, splice {{code}} commands.
        return <RichContent html={richHtml} stripStyles />;
      }
      return undefined;
    },
  });
}

/**
 * Render a KTL template. Returns the React tree, or `null` when both the
 * stored template AND its seed fallback fail (caller decides what legacy path
 * to take). Draft surfaces receive an inline error card instead of silence.
 */
export function TemplateRenderer({
  template,
  data,
  ctx,
  seedKey,
  channelKey,
  resolvePartial,
  draft = false,
}: TemplateRenderProps): React.ReactNode {
  const attempt = (source: string): React.ReactNode => {
    const ast = compileCached(source);
    const segments = evaluateKtl(ast, { data, resolvePartial });
    return renderSegments(segments, ctx, draft);
  };

  try {
    return attempt(template);
  } catch (error) {
    // tier 1: the dev-extracted seed template
    if (seedKey && channelKey) {
      const seed = getSeedTemplate(channelKey, seedKey);
      if (seed && seed !== template) {
        try {
          const rendered = attempt(seed);
          if (draft) {
            return (
              <>
                <div className="mx-auto my-2 max-w-3xl rounded border border-dashed border-rose-300 bg-rose-50 px-4 py-2 text-xs text-rose-700">
                  Template error — showing the default design instead:{" "}
                  {error instanceof Error ? error.message : "failed to render"}
                </div>
                {rendered}
              </>
            );
          }
          return rendered;
        } catch {
          // fall through to tier 2
        }
      }
    }
    // tier 2: caller's legacy component path
    if (draft) {
      return (
        <div className="mx-auto my-2 max-w-3xl rounded border border-dashed border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Template failed to render:{" "}
          {error instanceof Error ? error.message : "unknown error"}
        </div>
      );
    }
    return null;
  }
}

// re-export for SubBlockRenderer / fork blocks
export { domToReact };
export type { KtlNode };
