/**
 * Which new-style addresses an OLD-style address could be asking for.
 *
 * The legacy Industry Kitchens site served everything from the root — a product was
 * `/roband-dm31w`, an information page `/terms-and-conditions`, a category
 * `/catering-equipment/benchtop-equipment/commercial-toasters`. The new storefront
 * namespaces them under `/products/`, `/pages/` and `/categories/` (Steve, 2026-08-05:
 * "move to the new style"). The imported Zoey map covers every address the old site had
 * a redirect FOR, but not the addresses that simply WERE the page — `/terms-and-conditions`
 * was never redirected on the old site because it was the live page, and it is exactly
 * the kind of address Google holds and the imported legacy pages link to.
 *
 * So after the redirect table has had its say, an unclaimed address is probed against
 * what the storefront publishes today. That keeps working as the catalogue changes and
 * needs no row per product.
 *
 * Pure: it only says WHAT to look up and in what order. The route does the looking up.
 */

export type LegacyProbeKind = "product" | "category" | "page";

export interface LegacyProbe {
  kind: LegacyProbeKind;
  slug: string;
}

/** Zoey appended a numeric disambiguator to duplicate slugs (`combi-ovens-4`). */
const withoutZoeySuffix = (slug: string): string | null => {
  const stripped = slug.replace(/-\d+$/, "");
  return stripped && stripped !== slug ? stripped : null;
};

/**
 * Zoey turned an ampersand in a category name into its own EMPTY word, so
 * "Scales & Timers" became `scales--timers` and "Sinks & Basins" became
 * `sinks--basins`. Our slugs collapse that to a single hyphen (`scales-timers`),
 * so a legacy address that carries the doubled hyphen misses a category that is
 * sitting right there. Measured on the Industry Kitchens cutover replay: a
 * whole class of legacy category landing pages 404ing for this reason alone,
 * every one of them with a live page to land on (card InEoeMZh).
 */
const withCollapsedHyphens = (slug: string): string | null => {
  const collapsed = slug.replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");
  return collapsed && collapsed !== slug ? collapsed : null;
};

/**
 * Every spelling of one legacy category slug worth a lookup, best first.
 *
 * Shared with the brand-RANGE route (`/brands/<brand>/<range>`), which does its
 * own category lookup and is where 2,691 legacy addresses land — and where a
 * miss is quieter than a 404: the page falls back to the brand's WHOLE catalogue,
 * so `/brands/3monkeez/grates--drains` silently showed every 3monkeez product
 * instead of the grates. The imported Industry Kitchens pages (m4Y1MlQp) carry
 * three of those doubled-hyphen range links and nine more category ones, which is
 * how the class was found. (InEoeMZh.)
 */
export function categorySlugCandidates(slug: string): string[] {
  const out: string[] = [];
  for (const candidate of [
    slug,
    withoutZoeySuffix(slug),
    withCollapsedHyphens(slug),
    withCollapsedHyphens(withoutZoeySuffix(slug) ?? ""),
  ]) {
    if (candidate && !out.includes(candidate)) out.push(candidate);
  }
  return out;
}

/**
 * The probes to try, in order, for an address no route claimed.
 *
 * A ONE-segment address is whatever Zoey published at the root, so it could be any of
 * the three; products come first because they are the overwhelming majority and the
 * ones with rankings attached. A DEEPER address was a category path — Zoey nested
 * categories and nothing else — so only its last segment is worth asking about.
 */
export function legacyProbes(pathname: string): LegacyProbe[] {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return [];
  const last = segments[segments.length - 1];
  if (!last) return [];

  const probes: LegacyProbe[] =
    segments.length === 1
      ? [
          { kind: "product", slug: last },
          { kind: "category", slug: last },
          { kind: "page", slug: last },
        ]
      : [
          { kind: "category", slug: last },
          { kind: "product", slug: last },
        ];

  // Last resorts, in order of how sure we are: strip Zoey's numeric
  // disambiguator, then collapse its doubled hyphens, then both together. Each
  // is only ever an EXTRA candidate tried once everything above it has missed,
  // so it can turn a 404 into a redirect and can never re-point a live answer.
  const seen = new Set(probes.map((p) => `${p.kind}:${p.slug}`));
  for (const slug of [
    withoutZoeySuffix(last),
    withCollapsedHyphens(last),
    withCollapsedHyphens(withoutZoeySuffix(last) ?? ""),
  ]) {
    if (!slug) continue;
    const key = `category:${slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    probes.push({ kind: "category", slug });
  }
  return probes;
}

/** Where a probe of this kind sends the shopper once it hits. */
export function newStyleAddress(probe: LegacyProbe): string {
  switch (probe.kind) {
    case "product":
      return `/products/${probe.slug}`;
    case "category":
      return `/categories/${probe.slug}`;
    case "page":
      return `/pages/${probe.slug}`;
  }
}
