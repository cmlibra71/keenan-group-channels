import { getChannelSetting } from "@/lib/store";
import { builderCssHash, builderCssHashFromFile } from "@/builder/builder-css";

/**
 * GET /builder-css/<hash>.css — the published Site Builder stylesheet the node
 * pages link (builder/builder-css-link.tsx). Read through the same cached
 * channel-setting reader the pages use, so a page and its stylesheet always
 * agree on what "published" is.
 *
 * The URL is the content's hash, so a matching request is cached for a year as
 * immutable. A hash that no longer matches (a page rendered just before a CMS
 * publish, or an old tab) still gets the CURRENT stylesheet — an unstyled page
 * would be worse — but uncached, so that copy is never stored under the old name.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const wanted = builderCssHashFromFile((await params).file);
  if (!wanted) return new Response("Not found", { status: 404 });
  const css =
    ((await getChannelSetting("builder_published_css").catch(() => null)) as { css?: string } | null)?.css ?? "";
  if (!css) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  return new Response(css, {
    headers: {
      "content-type": "text/css; charset=utf-8",
      "cache-control": builderCssHash(css) === wanted ? "public, max-age=31536000, immutable" : "no-store",
    },
  });
}
