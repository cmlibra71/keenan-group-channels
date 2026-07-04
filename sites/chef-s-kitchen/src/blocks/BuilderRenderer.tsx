import * as React from "react";
import parse, { Element, type DOMNode } from "html-react-parser";
import DOMPurify from "isomorphic-dompurify";
import type { RenderContext } from "@keenan/services";
import { BlockRenderer, type RenderedBlock } from "@/blocks/BlockRenderer";
import { scopeCssToRoot } from "@/lib/builder-css";

// Storefront renderer for a GrapesJS-authored page. Sanitizes the exported HTML,
// scopes the exported CSS to .kg-doc, and splices our components at
// data-kg-widget markers by delegating to the SAME BlockRenderer the block CMS
// uses (fed the route's RenderContext — checkout logic unchanged). The
// GrapesJS-assigned id/class are preserved on the wrapper so freeform #id / .class
// rules still target it. Unknown/unavailable widgets are handled by BlockRenderer
// (labelled in draft, nothing in prod).
export function BuilderRenderer({
  html,
  css,
  ctx,
  draft = false,
}: {
  html: string;
  css: string;
  ctx?: RenderContext;
  draft?: boolean;
}) {
  const clean = DOMPurify.sanitize(html, { ADD_ATTR: ["target"] });
  const replace = (node: DOMNode) => {
    if (node instanceof Element && node.attribs?.["data-kg-widget"]) {
      const key = node.attribs["data-kg-widget"];
      const block: RenderedBlock = {
        block_type: key,
        region: "main",
        position: 0,
        props: {},
        is_visible: true,
      } as RenderedBlock;
      return (
        <div id={node.attribs.id} className={node.attribs.class} data-kg-widget={key}>
          <BlockRenderer blocks={[block]} context={ctx} draft={draft} />
        </div>
      );
    }
    return undefined;
  };
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: scopeCssToRoot(css || "", ".kg-doc") }} />
      <div className="kg-doc">{parse(clean, { replace })}</div>
    </>
  );
}
