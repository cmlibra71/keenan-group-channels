// ============================================================================
// The render-time half of the embed allow-list (card pNKI15L2).
//
// The resolver itself is unit-tested in @keenan/services. What is tested HERE
// is the thing a shopper actually meets: that this component frames an
// allow-listed flipbook, frames NOTHING else, and never emits author markup —
// because the stored prop is data, and data written before an allow-list
// tightened is exactly what a render-time check exists to catch.
//
// createElement rather than JSX so the file is a `.test.ts` the repo's test
// glob picks up.
// ============================================================================
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EmbedBlock } from "./EmbedBlock";

const render = (props: Record<string, unknown>): string =>
  renderToStaticMarkup(createElement(EmbedBlock, { props }));

test("a Publuu flipbook is framed, with embed=1 and the chosen shape", () => {
  const html = render({
    url: "https://publuu.com/flip-book/4712/9016",
    title: "Industry Kitchens Catalogue",
    aspect: "4:3",
    width: "wide",
  });
  assert.match(html, /<iframe/);
  assert.match(html, /src="https:\/\/publuu\.com\/flip-book\/4712\/9016\?embed=1"/);
  assert.match(html, /title="Industry Kitchens Catalogue"/);
  assert.match(html, /aspect-ratio:4 \/ 3/);
  assert.match(html, /max-w-5xl/);
});

test("shape and width fall back to the defaults when unset or unknown", () => {
  const html = render({ url: "https://publuu.com/flip-book/1/2", aspect: "banana", width: "x" });
  assert.match(html, /aspect-ratio:3 \/ 2/);
  assert.match(html, /max-w-5xl/);
  assert.match(html, /title="Catalogue"/);
});

test("a host that is not allow-listed renders NOTHING", () => {
  for (const url of [
    "https://evil.example/flip-book/1/2",
    "https://publuu.com.evil.example/flip-book/1/2",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
  ]) {
    assert.equal(render({ url }), "", `${url} should render nothing`);
  }
});

test("no url, or a non-string url, renders nothing", () => {
  assert.equal(render({}), "");
  assert.equal(render({ url: "" }), "");
  assert.equal(render({ url: 42 }), "");
  assert.equal(render({ url: { src: "https://publuu.com/flip-book/1/2" } }), "");
});

test("markup stored in the prop is never emitted — only the src survives", () => {
  const html = render({
    url: `<script>steal()</script><iframe src="https://publuu.com/flip-book/1/2"></iframe>`,
  });
  assert.doesNotMatch(html, /<script/);
  assert.doesNotMatch(html, /steal\(\)/);
  assert.match(html, /src="https:\/\/publuu\.com\/flip-book\/1\/2\?embed=1"/);
  // exactly one frame — the author's markup did not add a second
  assert.equal(html.match(/<iframe/g)?.length, 1);
});

test("the frame cannot be used to smuggle attributes", () => {
  const html = render({
    url: `https://publuu.com/flip-book/1/2" onload="alert(1)`,
    title: `x" onerror="alert(1)`,
  });
  assert.doesNotMatch(html, /onload=/);
  assert.doesNotMatch(html, /onerror="alert/);
});
