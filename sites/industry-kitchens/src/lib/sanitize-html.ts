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
      "blockquote", "pre", "code",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
      "img", "figure", "figcaption",
    ],
    ALLOWED_ATTR: [
      "href", "title", "target", "rel", "name",
      "src", "alt", "width", "height", "loading",
      "colspan", "rowspan", "align", "valign",
      "class", "style", "color", "face",
    ],
    // Defence in depth — these are dropped even if the lists above ever change.
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "style", "link", "base"],
    ALLOW_DATA_ATTR: false,
  });
}
