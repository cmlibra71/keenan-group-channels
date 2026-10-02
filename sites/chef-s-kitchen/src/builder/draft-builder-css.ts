import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  buildLiveBuilderCss,
  builderCompilerInput,
  builderCompilerKey,
  collectPageBuilderClasses,
  draftCompileClasses,
  type BuilderCssInputs,
  type NodeTree,
} from "@keenan/services/builder";

// ============================================================================
// Draft preview CSS — the builder stylesheet a DRAFT page would get once
// published.
//
// The published builder stylesheet (`builder_published_css`) is compiled by
// the portal from the channel's saved class inventory. A draft can use a class
// that inventory does not have yet — a draft written by a script
// (applyDraftOps), or saved before the portal's background recompile finished
// — and the draft preview then drew that element unstyled. Pages are reviewed
// and pixel-diffed as drafts before they are published, so the preview has to
// be exact.
//
// The portal stores the inputs of its last compile (`builder_css_inputs`: the
// class list + the compiler theme). On a draft render:
//   - every class the page can use (its tree, the masters it reaches, named
//     styles, safelists) already in the inventory → nothing to do; the
//     published sheet is exactly what a publish would serve;
//   - otherwise compile `inventory ∪ page classes` with the stored theme, the
//     same compiler input and post-processing as the portal's publish
//     (@keenan/services builder-css), and serve that ONE sheet in place of the
//     published one — byte-for-byte the sheet the next publish produces.
//   - no stored inputs (before the portal first wrote them) → published sheet.
//
// The compiler is the portal's Tailwind version, installed here under the
// alias `tailwind-builder-node` (root package.json) so the site's own
// Tailwind can move independently. It is loaded through a runtime require so
// nothing is bundled and a published page never touches it; if it cannot be
// loaded the draft falls back to the published sheet — exactly the behaviour
// before this existed. That is the case in the standalone production image
// today (the runtime require is not traced into it), so on the live site a
// draft preview still shows only published classes; local builds (`next build
// && next start` with full node_modules, the parity harness) compile.
//
// Draft-only. Never called for a published render.
// ============================================================================

type Compiler = { build: (candidates: string[]) => string };
type CompileFn = (css: string, opts: { base: string; onDependency: (p: string) => void }) => Promise<Compiler>;

const ALIAS = "tailwind-builder-node";
const MAX_SHEETS = 32;
const MAX_COMPILERS = 4;

let loader: Promise<{ compile: CompileFn; base: string } | null> | null = null;
const compilers = new Map<string, Promise<Compiler>>();
const sheets = new Map<string, string>();

function loadCompiler(): Promise<{ compile: CompileFn; base: string } | null> {
  if (!loader) {
    loader = (async () => {
      try {
        // Through process.getBuiltinModule so the bundler neither traces nor
        // warns about this require: it is meant to happen at runtime only.
        const { createRequire } = process.getBuiltinModule("node:module") as typeof import("node:module");
        const req = createRequire(path.join(process.cwd(), "package.json"));
        // The package exports no ./package.json — find its folder from the entry.
        let base = path.dirname(req.resolve(ALIAS));
        while (!existsSync(path.join(base, "package.json")) && path.dirname(base) !== base) {
          base = path.dirname(base);
        }
        const mod = req(ALIAS) as { compile: CompileFn };
        // `@import "tailwindcss"` resolves from `base`: the alias's own folder,
        // so the theme/preflight CSS comes from the SAME Tailwind version as the
        // compiler (its nested copy), not from the site's newer one.
        return { compile: mod.compile, base };
      } catch (e) {
        console.error("[draft-builder-css] compiler unavailable:", e instanceof Error ? e.message : e);
        return null;
      }
    })();
  }
  return loader;
}

/**
 * The full builder stylesheet for a draft render, or null when the published
 * sheet already is that stylesheet (or the draft cannot be compiled). Memoised
 * per (theme, class set), least-recently-used.
 */
export async function draftBuilderCss(input: {
  tree: NodeTree | null | undefined;
  components?: Record<string, NodeTree | null | undefined>;
  namedStyles?: Record<string, string[] | null | undefined>;
  inputs?: BuilderCssInputs | null;
  /** `generated_at` of the published blob. The portal writes the sheet and the
   *  inputs as two writes; if they disagree the inputs may describe an older
   *  compile, so the draft keeps the published sheet rather than risk serving
   *  a sheet built from a stale inventory. */
  publishedGeneratedAt?: string | null;
}): Promise<string | null> {
  try {
    if (input.inputs?.generated_at !== input.publishedGeneratedAt) return null;
    const pageClasses = collectPageBuilderClasses(input.tree, input.components ?? {}, input.namedStyles ?? {});
    const classes = draftCompileClasses(pageClasses, input.inputs);
    if (!classes) return null;
    const themeVars = input.inputs?.theme_vars ?? {};
    const themeKey = builderCompilerKey(themeVars);
    const sheetKey = createHash("sha256").update(themeKey).update("\0").update(classes.join(" ")).digest("hex");
    const hit = sheets.get(sheetKey);
    if (hit !== undefined) {
      sheets.delete(sheetKey);
      sheets.set(sheetKey, hit);
      return hit;
    }

    const loaded = await loadCompiler();
    if (!loaded) return null;
    let compiler = compilers.get(themeKey);
    if (!compiler) {
      if (compilers.size >= MAX_COMPILERS) compilers.delete(compilers.keys().next().value as string);
      compiler = loaded.compile(builderCompilerInput(themeVars), { base: loaded.base, onDependency: () => {} });
      compilers.set(themeKey, compiler);
      compiler.catch(() => compilers.delete(themeKey));
    }
    const css = buildLiveBuilderCss(await compiler, classes);
    if (sheets.size >= MAX_SHEETS) sheets.delete(sheets.keys().next().value as string);
    sheets.set(sheetKey, css);
    return css;
  } catch (e) {
    console.error("[draft-builder-css] compile failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Short content hash — the `href` React dedupes/hoists the <style> by. React
 *  hoists it into <head> where the published sheet's <link> would have gone and
 *  renders it as `<style data-precedence="kg-builder" data-href="kg-draft-…">` —
 *  the marker an audit can look for to prove a draft compiled its own sheet. */
export function draftCssId(css: string): string {
  return "kg-draft-" + createHash("sha256").update(css).digest("hex").slice(0, 16);
}
