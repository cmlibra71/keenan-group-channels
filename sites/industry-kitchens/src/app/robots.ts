import type { MetadataRoute } from "next";
import { getSiteConfig } from "@/lib/store";
import { isIndexable, siteBaseUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  // Non-public channels (build/test mirrors) stay fully disallowed and expose
  // no sitemap — opt a storefront in with SITE_INDEXABLE=true.
  if (!isIndexable()) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  const { site } = await getSiteConfig();
  const base = siteBaseUrl(site?.url);

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Keep account, cart, checkout and internal API out of the index.
        disallow: ["/account", "/cart", "/checkout", "/api/", "/search"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
