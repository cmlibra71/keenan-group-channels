// Imported product copy through the REAL storefront sanitizer (DOMPurify) and the shared product
// payload enrichment — the path the judge used on 2026-09-30 to smuggle a style past the old
// single-pass strip (`<b stystyle=""le="…">`). Per-site on purpose (not in shared-modules.json):
// it checks this site's sanitizer with both settings of KEEP_TEXT_COLOR.
import { test } from "node:test";
import assert from "node:assert/strict";
import { enrichProductPayload } from "@keenan/services/product-page";
import { sanitizeHtml } from "./sanitize-html";

const payload = (html: string) =>
  ({ product: { type: "simple", description: html, warranty: null, descriptionShort: html }, reviews: { list: [] }, attachments: [], breadcrumbs: [], related: { products: [] } }) as never;
const run = (html: string, keepTextColor: boolean) =>
  String((enrichProductPayload(payload(html), { sanitizeHtml, keepTextColor }) as { product: { description: string } }).product.description);
const styles = (html: string) => [...html.matchAll(/\sstyle="([^"]*)"/gi)].map((m) => m[1]);

const ATTACKS = [
  `<b stystyle=""le="background:url(https://evil.example/x.png);position:fixed;inset:0;z-index:9999">x</b>`,
  `<b ststyle=""yle=""le="position:fixed">x</b>`,
  `<b sstyle=""tyle="x"style="position:fixed">x</b>`,
  `<b style=style="position:fixed">x</b>`,
  `<b title=">" style="background:url(x)">x</b>`,
  `<i style=color:expression(1)>y</i>`,
  `<b style = 'position:fixed'>x</b>`,
  `<b STYLE="position:fixed">x</b>`,
  `<img src="https://a.example/a.png" style="background:url(javascript:alert(1))">`,
  `<b style="font-size:14px" style="position:fixed">x</b>`,
  `<span style="color: rgb(192, 80, 77); background: url(x)">Serial No</span>`,
];

for (const keep of [false, true]) {
  test(`no style survives but a plain colour (keepTextColor ${keep})`, () => {
    for (const a of ATTACKS) {
      const out = run(a, keep);
      for (const s of styles(out)) assert.match(s, /^color:(#[0-9a-f]{3,6}|[a-z]{3,20})$/, `${a}\n-> ${out}`);
      if (!keep) assert.deepEqual(styles(out), [], `${a}\n-> ${out}`);
    }
  });
}

test("Zoey's red condition line keeps its colour on Industry Kitchens only", () => {
  const html = `<blockquote><span style="font-size: 14px;"><span style="color: rgb(192, 80, 77);">Serial No: 202408000093</span></span></blockquote>`;
  assert.equal(styles(run(html, true)).join(","), "color:#c0504d");
  assert.deepEqual(styles(run(html, false)), []);
});

test("a video embed keeps the sanitizer's own responsive styles", () => {
  const out = run(`<p><iframe src="https://www.youtube.com/embed/abc123" width="560" height="315"></iframe></p>`, false);
  assert.match(out, /class="kg-video-embed"[^>]*style="display:block;position:relative/);
  assert.match(out, /<iframe[^>]*style="position:absolute/);
});
