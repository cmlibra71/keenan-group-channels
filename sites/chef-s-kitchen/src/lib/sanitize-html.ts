import DOMPurify from "isomorphic-dompurify";

/**
 * Sanitize untrusted HTML (catalog / CMS / blog content) before it is handed to
 * `dangerouslySetInnerHTML`. Strips <script>/<iframe>/event-handlers/javascript:
 * URIs while keeping the formatting tags our editorial content relies on.
 *
 * isomorphic-dompurify runs in both server and client components (it uses jsdom
 * on the server, the browser DOM on the client).
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    // Allow normal formatting + tables + media; everything else is dropped.
    ALLOWED_TAGS: [
      "p", "br", "hr", "div", "span",
      "b", "i", "em", "strong", "u", "s", "strike", "small", "sub", "sup", "mark", "font",
      "a", "ul", "ol", "li", "dl", "dt", "dd",
      "blockquote", "pre", "code", "kbd", "samp", "var", "abbr", "cite", "q", "time", "address",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
      "img", "figure", "figcaption",
      // The structure the Zoey-era information pages are written in. Without these
      // the warranty page's <header> and its five <section>s collapse into one run
      // of prose and every style rule written against them stops matching, which
      // is most of what "the portal does not support these pages" looked like.
      // [card vMQUPzG6]
      "section", "article", "header", "footer", "aside", "nav", "main",
      // The accordion. <details>/<summary> is the one interactive control that
      // needs no script, which is why the Zoey FAQ is built out of it and why it
      // survives when the page's own JavaScript cannot.
      "details", "summary",
      // Inert buttons — event handlers never survive sanitization, so a button
      // here is a shape and the page's CSS is what makes it look like one.
      "button",
      // Inline-SVG icons (DOMPurify sanitizes SVG vectors) — the same subset
      // sanitizeKtlHtml below has always allowed.
      "svg", "path", "g", "circle", "ellipse", "line", "polyline", "polygon", "rect",
    ],
    ALLOWED_ATTR: [
      "href", "title", "target", "rel", "name",
      "src", "srcset", "sizes", "alt", "width", "height", "loading", "decoding",
      "colspan", "rowspan", "align", "valign", "scope",
      "class", "style", "color", "face",
      "aria-label", "aria-hidden", "aria-expanded", "aria-controls", "role",
      // `<details open>` — an accordion panel the author left expanded. `hidden`
      // and `type` are the two other inert state attributes these pages use.
      "open", "hidden", "type",
      // SVG geometry (the tags above are useless without it).
      "viewBox", "d", "fill", "stroke", "stroke-width", "stroke-linecap",
      "stroke-linejoin", "cx", "cy", "r", "x", "y", "x1", "y1", "x2", "y2",
      "points", "rx", "ry", "xmlns",
    ],
    // Defence in depth — these are dropped even if the lists above ever change.
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "style", "link", "base"],
    // Still off here. A page that needs to style rows by state
    // (`tr[data-no-residential]`) carries its own markup AND its own scoped
    // stylesheet in a Site Builder HTML block, which is a different render path
    // (`hardenCodeHtml` / `scopeCodeHtml` in @keenan/services). This one governs
    // product descriptions and imported legacy bodies, where a data attribute
    // would only be a hook for styling that has nowhere to come from — and
    // `data-node-id` is a handle the builder canvas measures boxes with.
    ALLOW_DATA_ATTR: false,
  });
}

/**
 * Sanitize KTL template output (CMS v2). Identical policy to sanitizeHtml plus
 * structural section tags and the two INERT sentinel elements the
 * TemplateRenderer plants where locked widgets / rich bindings get spliced
 * back in as React components:
 *   <ktl-w data-w="i"></ktl-w>   <ktl-rich data-r="i"></ktl-rich>
 * The WHOLE assembled string is sanitized once (not per segment) so author
 * markup that WRAPS a widget stays balanced — DOMPurify would otherwise
 * auto-close tags at segment boundaries and break the structure.
 */
export function sanitizeKtlHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p", "br", "hr", "div", "span",
      "b", "i", "em", "strong", "u", "s", "strike", "small", "sub", "sup", "mark", "font",
      "a", "ul", "ol", "li", "dl", "dt", "dd",
      "blockquote", "pre", "code",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
      "img", "figure", "figcaption",
      "section", "article", "nav", "aside", "header", "footer",
      // inert buttons only — event handlers never survive sanitization, and
      // interactive behavior comes from locked widgets, not template markup
      "button",
      // minimal inline-SVG subset for icons (DOMPurify sanitizes SVG vectors)
      "svg", "path", "circle", "line", "polyline", "polygon", "rect",
      "ktl-w", "ktl-rich",
    ],
    ALLOWED_ATTR: [
      "href", "title", "target", "rel", "name",
      "src", "srcset", "sizes", "alt", "width", "height", "loading", "decoding",
      "colspan", "rowspan", "align", "valign",
      "class", "style", "color", "face",
      "aria-label", "aria-hidden", "role",
      "disabled", "type",
      "viewBox", "d", "fill", "stroke", "stroke-width", "stroke-linecap",
      "stroke-linejoin", "cx", "cy", "r", "x", "y", "x1", "y1", "x2", "y2",
      "points", "rx", "xmlns",
      "data-w", "data-r",
    ],
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "style", "link", "base"],
    ALLOW_DATA_ATTR: false,
  });
}
