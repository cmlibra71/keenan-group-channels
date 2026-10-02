import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const src = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "Footer.tsx"), "utf8");

// 390px: the fixed "Talk to a Specialist" float (bottom-5, ~44px tall) covered the copyright line.
test("the footer's legal line keeps room below it for the specialist float on phones only", () => {
  assert.match(src, /pb-\[4\.5rem\][^"]*lg:pb-0/);
});
