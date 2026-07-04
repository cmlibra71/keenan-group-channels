// Scope GrapesJS-exported CSS to the builder document root so freeform styles
// can't leak into site chrome. Prefixes every rule selector with `root`,
// recurses into @media/@supports, and leaves @keyframes/@font-face bodies
// untouched. Proven in the Phase-0b spike.
export function scopeCssToRoot(css: string, root: string): string {
  let out = "";
  let i = 0;
  while (i < css.length) {
    const start = i;
    while (i < css.length && css[i] !== "{" && css[i] !== "}") i++;
    const prelude = css.slice(start, i).trim();
    if (css[i] === "{") {
      let depth = 1;
      i++;
      const bodyStart = i;
      while (i < css.length && depth > 0) {
        if (css[i] === "{") depth++;
        else if (css[i] === "}") depth--;
        i++;
      }
      const body = css.slice(bodyStart, i - 1);
      if (prelude.startsWith("@media") || prelude.startsWith("@supports")) {
        out += `${prelude}{${scopeCssToRoot(body, root)}}`;
      } else if (prelude.startsWith("@")) {
        out += `${prelude}{${body}}`;
      } else if (prelude) {
        const scoped = prelude
          .split(",")
          .map((s) => `${root} ${s.trim()}`)
          .join(", ");
        out += `${scoped}{${body}}`;
      }
    } else {
      i++;
    }
  }
  return out;
}
