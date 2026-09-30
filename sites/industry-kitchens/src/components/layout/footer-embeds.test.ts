import { test } from "node:test";
import assert from "node:assert/strict";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The root test run compiles TSX with the classic runtime (React.createElement), the site's own run
// with the automatic one; a global React makes Footer.tsx load under both.
(globalThis as { React?: unknown }).React = React;

const OLD_IK = `<iframe src="https://publuu.com/flip-book/859621/2482042/page/1?embed" width="100%" height="380"></iframe>`;

test("the footer frames the stored Publuu flip-book (IK parity #659/#726), and only publuu.com", async () => {
  const { Footer } = await import("./Footer");
  const html = renderToStaticMarkup(
    createElement(Footer, {
      storeName: "Industry Kitchens",
      config: {
        embeds: [
          { title: "Industry Kitchens catalogue", url: OLD_IK, height: 380 },
          { title: "Nope", url: "https://evil.example/flip-book/1/2" },
          { title: "Video", url: "https://www.youtube.com/watch?v=N64mS1AuvrQ" },
        ],
      },
    })
  );
  const frames = html.match(/<iframe[^>]*>/g) ?? [];
  assert.equal(frames.length, 1);
  assert.match(frames[0], /src="https:\/\/publuu\.com\/flip-book\/859621\/2482042\/page\/1\?embed=1"/);
  assert.match(frames[0], /title="Industry Kitchens catalogue"/);
  assert.match(frames[0], /height="380"/);
});

test("no embeds → no iframe and no embed row", async () => {
  const { Footer } = await import("./Footer");
  const html = renderToStaticMarkup(createElement(Footer, { storeName: "Industry Kitchens", config: {} }));
  assert.doesNotMatch(html, /<iframe/);
  assert.doesNotMatch(html, /data-footer-embeds/);
});
