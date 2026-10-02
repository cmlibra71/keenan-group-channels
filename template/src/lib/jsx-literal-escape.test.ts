import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Root cause warranty-directory-escape: a JSX attribute written as a plain string
// (`placeholder="keyword…"`) is NOT a JavaScript string literal, so the
// escape is never processed and the shopper reads a literal backslash-u-2026 in
// the Warranty & Service Directory search box. Write the character itself, or use
// an expression (`placeholder={"keyword…"}`). This guard scans every .tsx in
// this tree so the same slip cannot come back anywhere.

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
// attr="...\uXXXX..." — a quoted JSX attribute value holding a unicode escape.
const ESCAPE_IN_JSX_ATTR = /\s[a-zA-Z-]+="[^"{}\n]*\\u[0-9a-fA-F]{4}[^"\n]*"/;

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

test("no JSX attribute string carries a literal \\uXXXX escape", () => {
  const offenders: string[] = [];
  for (const file of tsxFiles(SRC)) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (ESCAPE_IN_JSX_ATTR.test(line)) offenders.push(`${relative(SRC, file)}:${i + 1}: ${line.trim()}`);
      });
  }
  assert.deepEqual(offenders, []);
});

test("the warranty directory placeholder ends in a real ellipsis", () => {
  const src = readFileSync(join(SRC, "components/product/WarrantyDirectory.tsx"), "utf8");
  assert.match(src, /placeholder="Search by brand, equipment type, or keyword…"/);
});
