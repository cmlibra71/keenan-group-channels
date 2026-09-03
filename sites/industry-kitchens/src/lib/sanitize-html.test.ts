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
    `<main><article><aside>Note</aside></article></main>` +
    `<nav><a href="/pages/warranty">Back</a></nav>` +
    `<footer>Footer</footer>`;
  assert.equal(sanitizeHtml(html), html);
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
