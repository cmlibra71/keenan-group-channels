import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeHtml } from "./sanitize-html";

// The Zoey-era information pages (Industry Kitchens warranty, "find your
// manufacturer") are written in semantic structure with a native <details>
// accordion and inline SVG icons. Every one of those tags used to be deleted,
// which took the page's own style rules with it. [card vMQUPzG6]

test("keeps the structural tags the Zoey pages are written in", () => {
  const html =
    `<header><h1>Warranty</h1></header>` +
    `<section class="panel-blue"><h2>How to claim</h2><p>Steps</p></section>` +
    `<main><p>Body</p></main>` +
    `<nav><a href="/pages/warranty">Back</a></nav>` +
    `<footer>Footer</footer>`;
  assert.equal(sanitizeHtml(html), html);
});

test("the allow-list is not widened past what we actually render", () => {
  // Measured 2026-09-08 across both Zoey pages, the Industry Kitchens terms body
  // and every production product description: zero uses of any of these, so they
  // stay out. The tag is unwrapped, never the text inside it. [card vMQUPzG6]
  for (const tag of ["article", "aside", "samp", "var", "abbr", "cite", "time", "address"]) {
    const out = sanitizeHtml(`<${tag}>keep me</${tag}>`);
    assert.equal(out.includes(`<${tag}`), false, `${tag} should not survive`);
    assert.ok(out.includes("keep me"), `${tag} should not eat its own text`);
  }
  // `kbd` IS on the list — the manufacturer directory's keyboard hints.
  assert.equal(sanitizeHtml("<kbd>&larr;</kbd>"), "<kbd>←</kbd>");
});

test("keeps the native accordion, open panels included", () => {
  const html =
    `<details class="accordion" open=""><summary>When does my warranty start?</summary>` +
    `<div class="panel"><p>From the invoice date.</p></div></details>`;
  const out = sanitizeHtml(html);
  assert.match(out, /<details class="accordion" open=""?>/);
  assert.match(out, /<summary>When does my warranty start\?<\/summary>/);
});

test("keeps inline SVG icons and inert buttons", () => {
  const html = `<button class="wdir-btn" type="button" aria-label="Filter"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5l7 7"></path><circle cx="5" cy="5" r="2"></circle></svg>Filter</button>`;
  const out = sanitizeHtml(html);
  assert.match(out, /<button/);
  assert.match(out, /<svg viewBox="0 0 24 24"/);
  assert.match(out, /<path d="M12 5l7 7"/);
  assert.match(out, /<circle cx="5" cy="5" r="2"/);
});

test("keeps the class and inline style the page's own CSS hangs off", () => {
  const html = `<section class="panel-red" style="margin:0 0 28px 0"><h2 style="color:var(--red)">Tips</h2></section>`;
  assert.equal(sanitizeHtml(html), html);
});

test("still drops everything that executes", () => {
  assert.equal(sanitizeHtml(`<script>alert(1)</script><p>Hi</p>`), "<p>Hi</p>");
  assert.equal(sanitizeHtml(`<style>body{margin:0}</style><p>Hi</p>`), "<p>Hi</p>");
  assert.equal(sanitizeHtml(`<button onclick="alert(1)">x</button>`), "<button>x</button>");
  assert.equal(sanitizeHtml(`<a href="javascript:alert(1)">x</a>`), "<a>x</a>");
  assert.equal(sanitizeHtml(`<form action="https://evil"><input name="pw"></form>`), "");
  assert.equal(sanitizeHtml(`<iframe src="//evil"></iframe><b>ok</b>`), "<b>ok</b>");
  assert.equal(sanitizeHtml(`<svg><script>alert(1)</script></svg>`), "<svg></svg>");
});

test("still drops id, so an in-page anchor stays <a name>", () => {
  // The terms page's contents list is anchored with <a name>, never id, exactly
  // because this allow-list drops id — a contents list anchored with ids scrolls
  // nowhere. [card JJt81JQv, content.md sf-content-page]
  assert.equal(sanitizeHtml(`<h2 id="clause-10">Returns</h2>`), "<h2>Returns</h2>");
  assert.equal(sanitizeHtml(`<a name="clause-10"></a>`), `<a name="clause-10"></a>`);
});

test("still drops data attributes on this path", () => {
  assert.equal(
    sanitizeHtml(`<table><tbody><tr data-no-residential=""><td>x</td></tr></tbody></table>`),
    "<table><tbody><tr><td>x</td></tr></tbody></table>"
  );
  assert.equal(sanitizeHtml(`<div data-node-id="code-1">x</div>`), "<div>x</div>");
});

test("a `hidden` attribute never survives — it could only ever hide copy", () => {
  // This policy also governs product descriptions and imported legacy bodies
  // (catalogue.md sf-product-page / sf-catalog-browse). A Zoey-era description
  // carrying `hidden` on a wrapper would render nothing at all. [card vMQUPzG6]
  const out = sanitizeHtml(`<section hidden><p>Specifications</p></section>`);
  assert.equal(out.includes("hidden"), false);
  assert.ok(out.includes("Specifications"));
});

// Root cause description-iframes-stripped: the old Industry Kitchens site shows
// YouTube videos inside product descriptions; every iframe used to be deleted.

test("keeps a YouTube embed, rebuilt with our own safe attributes and a responsive wrapper", () => {
  const out = sanitizeHtml(
    `<p>Watch:</p><iframe width="560" height="315" src="//www.youtube.com/embed/IEAUhsvLFjI" frameborder="0" allow="autoplay" onload="alert(1)" allowfullscreen></iframe>`
  );
  assert.match(out, /^<p>Watch:<\/p><span class="kg-video-embed" style="[^"]*padding-bottom:56.25%[^"]*"><iframe /);
  assert.match(out, /src="https:\/\/www\.youtube\.com\/embed\/IEAUhsvLFjI"/);
  assert.match(out, /sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"/);
  assert.match(out, /referrerpolicy="strict-origin-when-cross-origin"/);
  assert.match(out, /loading="lazy"/);
  assert.equal(out.includes("onload"), false);
  assert.equal(out.includes("frameborder"), false);
  assert.equal(out.includes('width="560"'), false, "the wrapper sizes the frame, not its authored width");
});

test("keeps youtube-nocookie and Vimeo player embeds", () => {
  assert.match(
    sanitizeHtml(`<iframe src="https://www.youtube-nocookie.com/embed/abc"></iframe>`),
    /src="https:\/\/www\.youtube-nocookie\.com\/embed\/abc"/
  );
  assert.match(
    sanitizeHtml(`<iframe src="https://player.vimeo.com/video/123456"></iframe>`),
    /src="https:\/\/player\.vimeo\.com\/video\/123456"/
  );
});

test("any other iframe is still dropped — host compared after URL parsing, not by substring", () => {
  for (const src of [
    "https://evil.example/embed/x",
    "https://youtube.com.evil.example/embed/x",
    "https://evil.example/?u=https://www.youtube.com/embed/x",
    "https://www.youtube.com/watch?v=x",
    "https://vimeo.com/123",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "https://user:pw@www.youtube.com/embed/x",
    "",
  ]) {
    const out = sanitizeHtml(`<iframe src="${src}"></iframe><b>ok</b>`);
    assert.equal(out, "<b>ok</b>", `iframe with src ${JSON.stringify(src)} should not survive`);
  }
});

test("sanitizing twice keeps ONE wrapper (idempotent)", () => {
  const once = sanitizeHtml(`<iframe src="https://www.youtube.com/embed/abc"></iframe>`);
  assert.equal(sanitizeHtml(once), once);
});

test("an embed wrapped in a paragraph keeps its surrounding text", () => {
  const out = sanitizeHtml(`<p>Before <iframe src="https://www.youtube.com/embed/abc"></iframe> after</p>`);
  assert.match(out, /Before /);
  assert.match(out, / after/);
  assert.match(out, /^<p>Before <span class="kg-video-embed"[^>]*><iframe [^>]*><\/iframe><\/span> after<\/p>$/);
});
