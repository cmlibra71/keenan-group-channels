import Link from "next/link";
import { loadBundles } from "@/lib/promotions/bundles";
import { Price } from "@/components/ui/Price";

export const metadata = { title: "Bundles" };

/**
 * The index of live bundles (card p6YVxc4P). Each bundle's own page is the thing
 * the card asks for; this exists so the pages are reachable without knowing the
 * slug, and so a marketing link can point at "our bundles" rather than one of
 * them. Empty until the business authors a bundle promotion.
 */
export default async function BundlesPage() {
  const bundles = await loadBundles().catch(() => []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-ink-900">Bundles</h1>
      <p className="mt-2 text-steel-600">
        Buy a set together and save on every product in it.
      </p>

      {bundles.length === 0 ? (
        <p className="mt-8 text-steel-500">There are no bundles running at the moment.</p>
      ) : (
        <ul className="mt-8 space-y-4">
          {bundles.map((bundle) => (
            <li key={bundle.slug} className="rounded-lg border border-steel-200 p-6">
              <Link href={`/bundles/${bundle.slug}`} className="text-lg font-semibold text-ink-900 hover:underline">
                {bundle.headline}
              </Link>
              <p className="mt-1 text-sm font-medium text-brand">{bundle.percent}% off the bundle</p>
              <p className="mt-2 text-sm text-steel-600">
                {bundle.components.length} product{bundle.components.length === 1 ? "" : "s"} ·{" "}
                <span className="font-medium">
                  <Price amount={bundle.bundleTotal} />
                </span>{" "}
                ex GST
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
