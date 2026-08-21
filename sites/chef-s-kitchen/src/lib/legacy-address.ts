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

  const base = withoutZoeySuffix(last);
  if (base) probes.push({ kind: "category", slug: base });
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
