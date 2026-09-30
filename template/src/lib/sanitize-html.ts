import DOMPurify from "isomorphic-dompurify";

/**
 * Sanitize untrusted HTML (catalog / CMS / blog content) before it is handed to
 * `dangerouslySetInnerHTML`. Strips <script>/<iframe>/event-handlers/javascript:
 * URIs while keeping the formatting tags our editorial content relies on. The one
 * iframe that survives is a YouTube / Vimeo video embed (see `finishVideoEmbeds`).
 *
 * isomorphic-dompurify runs in both server and client components (it uses jsdom
 * on the server, the browser DOM on the client).
 */
export function sanitizeHtml(html: string): string {
  // Only content that carries an <iframe> takes the DOM route below; everything
  // else is sanitized to a string exactly as it always was.
  if (!/<iframe/i.test(html)) return DOMPurify.sanitize(html, SANITIZE_CONFIG);
  const body = DOMPurify.sanitize(html, {
    ...SANITIZE_CONFIG,
    ADD_TAGS: ["iframe"],
    FORBID_TAGS: SANITIZE_CONFIG.FORBID_TAGS.filter((t) => t !== "iframe"),
    RETURN_DOM: true,
  }) as unknown as HTMLElement;
  finishVideoEmbeds(body);
  return body.innerHTML;
}

// ============================================================================
// Video embeds in product descriptions (root cause description-iframes-stripped).
//
// The old Industry Kitchens site shows YouTube videos INSIDE product descriptions
// (products 4644 and eight others). This sanitizer used to delete every <iframe>,
// so those videos vanished. An iframe now survives ONLY when its src is an https
// embed on one of the hosts below — compared after real URL parsing, never by
// substring, so `youtube.com.evil.example` is refused. Everything the author wrote
// on the frame except its size and title is thrown away and replaced with our own
// safe `sandbox` / `allow` / `referrerpolicy`, and the frame is wrapped in a 16:9
// box so it scales on a phone instead of overflowing at its authored 560px.
//
// Done on the sanitized DOM, not with a DOMPurify hook: hooks are global to the
// shared DOMPurify instance and would leak into every other caller.
// ============================================================================

/** The only hosts an iframe in authored content may point at, and the path each must embed. */
const VIDEO_EMBED_HOSTS: Record<string, RegExp> = {
  "youtube.com": /^\/embed\//,
  "www.youtube.com": /^\/embed\//,
  "youtube-nocookie.com": /^\/embed\//,
  "www.youtube-nocookie.com": /^\/embed\//,
  "player.vimeo.com": /^\/video\//,
};

const EMBED_WRAPPER_CLASS = "kg-video-embed";
// A <span> styled as a block, not a <div>: Zoey descriptions put the iframe inside a
// <p>, and a <div> there would be split out of the paragraph when the browser
// re-parses the markup (an iframe and a span are both phrasing content; a div is not).
const EMBED_WRAPPER_STYLE =
  "display:block;position:relative;width:100%;max-width:100%;padding-bottom:56.25%;height:0;overflow:hidden;margin:1rem 0";
const EMBED_FRAME_STYLE = "position:absolute;top:0;left:0;width:100%;height:100%;border:0";

/**
 * The SilverChef finance calculator — the ONE non-video embed authored content may carry (IK parity:
 * Zoey's Förje layout puts it at the top of LEASE OPTIONS, 49 products). Same discipline as the video
 * hosts: real URL parsing, exact host, fixed path prefix, and every author attribute thrown away.
 */
const CALCULATOR_EMBED_HOST = "www.silverchef.finance";
const CALCULATOR_EMBED_PATH = /^\/en_AU\/embed\/calculator\//;
const CALCULATOR_FRAME_STYLE = "display:block;width:100%;height:900px;border:1px solid #000;margin:1rem 0";

/** The https URL an authored calculator iframe src may keep, or null. Exported for the tests. */
export function allowedCalculatorEmbedSrc(raw: string | null | undefined): string | null {
  const src = String(raw ?? "").trim();
  if (!src) return null;
  let url: URL;
  try {
    url = new URL(src.startsWith("//") ? `https:${src}` : src);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  if (url.hostname.toLowerCase() !== CALCULATOR_EMBED_HOST || !CALCULATOR_EMBED_PATH.test(url.pathname)) return null;
  return url.toString();
}

/** The https URL an authored iframe src may keep, or null. Exported for the tests. */
export function allowedVideoEmbedSrc(raw: string | null | undefined): string | null {
  const src = String(raw ?? "").trim();
  if (!src) return null;
  let url: URL;
  try {
    // Protocol-relative (`//www.youtube.com/embed/x`) is how Zoey stored most of them.
    url = new URL(src.startsWith("//") ? `https:${src}` : src);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.port) return null;
  const path = VIDEO_EMBED_HOSTS[url.hostname.toLowerCase()];
  if (!path || !path.test(url.pathname)) return null;
  url.protocol = "https:";
  return url.toString();
}

function finishVideoEmbeds(root: HTMLElement): void {
  const doc = root.ownerDocument;
  for (const frame of Array.from(root.querySelectorAll("iframe"))) {
    const calculator = allowedCalculatorEmbedSrc(frame.getAttribute("src"));
    if (calculator) {
      for (const attr of Array.from(frame.attributes)) frame.removeAttribute(attr.name);
      frame.setAttribute("src", calculator);
      frame.setAttribute("title", "SilverChef finance calculator");
      frame.setAttribute("loading", "lazy");
      frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
      frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox");
      frame.setAttribute("style", CALCULATOR_FRAME_STYLE);
      frame.textContent = "";
      continue;
    }
    const src = allowedVideoEmbedSrc(frame.getAttribute("src"));
    if (!src) {
      frame.remove();
      continue;
    }
    const title = frame.getAttribute("title");
    for (const attr of Array.from(frame.attributes)) frame.removeAttribute(attr.name);
    frame.setAttribute("src", src);
    frame.setAttribute("title", title || "Video");
    frame.setAttribute("loading", "lazy");
    frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    frame.setAttribute("allow", "accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen");
    frame.setAttribute("allowfullscreen", "");
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-presentation allow-popups");
    frame.setAttribute("style", EMBED_FRAME_STYLE);
    // An iframe has no children worth keeping.
    frame.textContent = "";
    // Idempotent: content sanitized twice keeps one wrapper.
    const parent = frame.parentElement;
    if (parent && parent.classList.contains(EMBED_WRAPPER_CLASS) && parent.children.length === 1) {
      parent.setAttribute("style", EMBED_WRAPPER_STYLE);
      continue;
    }
    const wrapper = doc.createElement("span");
    wrapper.setAttribute("class", EMBED_WRAPPER_CLASS);
    wrapper.setAttribute("style", EMBED_WRAPPER_STYLE);
    frame.replaceWith(wrapper);
    wrapper.appendChild(frame);
  }
}

const SANITIZE_CONFIG = {
    // Allow normal formatting + tables + media; everything else is dropped.
    ALLOWED_TAGS: [
      "p", "br", "hr", "div", "span",
      "b", "i", "em", "strong", "u", "s", "strike", "small", "sub", "sup", "mark", "font",
      "a", "ul", "ol", "li", "dl", "dt", "dd",
      // `kbd` is here on evidence: the manufacturer directory uses two of them
      // for its keyboard hints. The rest of the text-level HTML5 set (samp, var,
      // abbr, cite, q, time, address) is deliberately NOT, measured 2026-09-08
      // over both Zoey pages, the Industry Kitchens terms body and every
      // production product description: zero occurrences of any of them. This
      // list is a security guard, so it is widened on measurement, not on
      // symmetry. [card vMQUPzG6]
      "blockquote", "pre", "code", "kbd",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
      "img", "figure", "figcaption",
      // The structure the Zoey-era information pages are written in. Without these
      // the warranty page's <header> and its eight <section>s collapse into one run
      // of prose and every style rule written against them stops matching, which
      // is most of what "the portal does not support these pages" looked like.
      // Each one is here because something on THIS render path uses it, counted
      // 2026-09-08: section 8 + header 1 on the warranty page, nav 1 on the
      // manufacturer directory, footer 1 in the Industry Kitchens terms body (which
      // reaches this function today, as a `page.body_html` binding), main in 32
      // production product descriptions scraped with a `<main
      // data-currency-iso-code>` wrapper. `article` and `aside` complete the
      // sectioning set and are deliberately LEFT OUT — nothing we render uses
      // either, and this list is the guard that stops authored HTML reaching a
      // customer. [card vMQUPzG6]
      "section", "header", "footer", "nav", "main",
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
      // `<details open>` — an accordion panel the author left expanded.
      // `hidden` is deliberately NOT here. This policy also governs product
      // descriptions and imported legacy bodies (RichContent reaches the product
      // page, the category pages and CategorySeo — catalogue.md sf-product-page
      // and sf-catalog-browse), and a Zoey-era description carrying `hidden` on
      // a wrapper would render NOTHING where it used to render its text. The
      // pages that toggle `hidden` do it from script, which never survives
      // sanitization anyway, so allowing it could only ever hide copy.
      "open", "type",
      // SVG geometry (the tags above are useless without it).
      "viewBox", "d", "fill", "stroke", "stroke-width", "stroke-linecap",
      "stroke-linejoin", "cx", "cy", "r", "x", "y", "x1", "y1", "x2", "y2",
      "points", "rx", "ry", "xmlns",
    ],
    // Defence in depth — these are dropped even if the lists above ever change.
    // `iframe` stays here: `sanitizeHtml` lifts it for ONE pass and then keeps only
    // allow-listed video embeds (see `finishVideoEmbeds`).
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "style", "link", "base"],
    // Still off here. A page that needs to style rows by state
    // (`tr[data-no-residential]`) carries its own markup AND its own scoped
    // stylesheet in a Site Builder HTML block, which is a different render path
    // (`hardenCodeHtml` / `scopeCodeHtml` in @keenan/services). This one governs
    // product descriptions and imported legacy bodies, where a data attribute
    // would only be a hook for styling that has nowhere to come from — and
    // `data-node-id` is a handle the builder canvas measures boxes with.
    ALLOW_DATA_ATTR: false,
};

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
