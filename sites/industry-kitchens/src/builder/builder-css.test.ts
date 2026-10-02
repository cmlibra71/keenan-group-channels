import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { builderCssHash, builderCssHashFromFile, builderCssHref } from "./builder-css.ts";

test("the href is the content hash, so any change to the stylesheet changes the URL", () => {
  const a = builderCssHref(".a{color:red}");
  const b = builderCssHref(".a{color:blue}");
  assert.match(a, /^\/builder-css\/[0-9a-f]{16}\.css$/);
  assert.notEqual(a, b);
  assert.equal(builderCssHref(".a{color:red}"), a);
  assert.equal(builderCssHash(".a{color:red}"), createHash("sha256").update(".a{color:red}").digest("hex").slice(0, 16));
});

test("the route accepts exactly <16 hex>.css and nothing else", () => {
  const hash = builderCssHash("x");
  assert.equal(builderCssHashFromFile(`${hash}.css`), hash);
  for (const bad of ["", "x.css", `${hash}.js`, `${hash}.css.map`, `../${hash}.css`, `${hash.toUpperCase()}.css`])
    assert.equal(builderCssHashFromFile(bad), null);
});
