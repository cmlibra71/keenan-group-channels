import { builderCssHref } from "./builder-css";

/**
 * The published builder stylesheet, linked instead of inlined (see ./builder-css.ts).
 *
 * `precedence` makes React hoist it into <head>, after the site's own stylesheets
 * (so it still wins ties, as the inline <style> placed after them did), where it is
 * render-blocking exactly like the inline copy was; on a client-side navigation
 * React holds the new page until it has loaded, so there is no unstyled flash.
 * Every rule in it is scoped to `[data-kg-nodes]`, so it is inert on any page that
 * draws no node tree. The id is kept: audits look for `id="kg-builder-css"` as
 * proof a page took the node path.
 */
export function BuilderCssLink({ css }: { css: string }) {
  if (!css) return null;
  return <link id="kg-builder-css" rel="stylesheet" href={builderCssHref(css)} precedence="kg-builder" />;
}
