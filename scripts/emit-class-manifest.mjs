// Emit public/cms-class-manifest.json for a built site: every class name
// present in the emitted CSS. The portal's template editor lints editor-typed
// class="" values against this so "not in this site's CSS" warnings are
// accurate per fork. Run after `next build` (postbuild) from a site dir:
//   node ../../scripts/emit-class-manifest.mjs [siteDir=.]
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const siteDir = process.argv[2] ?? ".";
const cssDirs = [join(siteDir, ".next", "static", "css"), join(siteDir, ".next", "static", "chunks")];

const classes = new Set();
for (const dir of cssDirs) {
  let entries = [];
  try { entries = await readdir(dir); } catch { continue; }
  for (const file of entries) {
    if (!file.endsWith(".css")) continue;
    const css = await readFile(join(dir, file), "utf8");
    // selector class names: .foo  .md\:bar  .lg\:col-span-2 …
    for (const m of css.matchAll(/\.((?:[\w-]|\\[:./[\]()%!#,])+)/g)) {
      classes.add(m[1].replace(/\\/g, ""));
    }
  }
}

await mkdir(join(siteDir, "public"), { recursive: true });
const out = join(siteDir, "public", "cms-class-manifest.json");
await writeFile(out, JSON.stringify([...classes].sort()));
console.log(`wrote ${classes.size} classes -> ${out}`);
