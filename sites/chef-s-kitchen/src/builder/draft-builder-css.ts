import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import {
  buildLiveBuilderCss,
  builderCompilerInput,
  builderCompilerKey,
  collectPageBuilderClasses,
  type BuilderCssBlob,
  type NodeTree,
} from "@keenan/services/builder";

// ============================================================================
// Draft preview CSS — compile a DRAFT page's authored classes on the fly.
//
// The published builder stylesheet (`builder_published_css`) is compiled by
// the portal from the channel's saved vocabulary. A draft can use a class it
// has not compiled yet — a draft written by a script (applyDraftOps), or one
// saved before the portal's background recompile finished — and the draft
// preview then drew that element unstyled. Pages are reviewed and pixel-diffed
// as drafts before they are published, so the preview has to be exact.
//
// So on a draft render we compile the page's classes (its tree, the masters it
// can reach, the named styles, the safelists) with the SAME compiler input and
// post-processing the portal's publish uses (@keenan/services builder-css),
// seeded with the theme the portal stored next to the published sheet, and
// emit the result AFTER the published sheet. Tailwind orders rules per class,
// so this sheet re-emits the page's rules in exactly the order a publish would
// put them; rules the published sheet already has are simply repeated.
//
// The compiler is the portal's Tailwind version, installed here under the
// alias `tailwind-builder-node` (root package.json) so the site's own
// Tailwind can move independently. It is loaded through a runtime require so
// nothing is bundled and a published page never touches it; if it cannot be
// loaded (an image without it) the draft falls back to the published sheet
// alone — exactly the behaviour before this existed.
//
// Draft-only. Never called for a published render.
// ============================================================================

type Compiler = { build: (candidates: string[]) => string };
type CompileFn = (css: string, opts: { base: string; onDependency: (p: string) => void }) => Promise<Compiler>;

const ALIAS = "tailwind-builder-node";
const MAX_SHEETS = 64;

let loader: Promise<{ compile: CompileFn; base: string } | null> | null = null;
const compilers = new Map<string, Promise<Compiler>>();
const sheets = new Map<string, string>();

function loadCompiler(): Promise<{ compile: CompileFn; base: string } | null> {
  if (!loader) {
    loader = (async () => {
      try {
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
 * The stylesheet a draft page needs on top of the published one, or "" when it
 * cannot be compiled. Memoised per (theme, class set).
 */
export async function draftBuilderCss(input: {
  tree: NodeTree | null | undefined;
  components?: Record<string, NodeTree | null | undefined>;
  namedStyles?: Record<string, string[] | null | undefined>;
  published?: BuilderCssBlob | null;
}): Promise<string> {
  try {
    const classes = collectPageBuilderClasses(input.tree, input.components ?? {}, input.namedStyles ?? {});
    const themeVars = input.published?.theme_vars ?? {};
    const themeKey = builderCompilerKey(themeVars);
    const sheetKey = themeKey + "|" + createHash("sha256").update(classes.join(" ")).digest("hex");
    const hit = sheets.get(sheetKey);
    if (hit !== undefined) return hit;

    const loaded = await loadCompiler();
    if (!loaded) return "";
    let compiler = compilers.get(themeKey);
    if (!compiler) {
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
    return "";
  }
}

/** Short content hash — the `href` React dedupes/hoists the <style> by. */
export function draftCssId(css: string): string {
  return "kg-draft-" + createHash("sha256").update(css).digest("hex").slice(0, 16);
}
