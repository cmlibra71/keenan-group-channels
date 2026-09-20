import Link from "next/link";
import { notFound } from "next/navigation";
import { loadBundle } from "@/lib/promotions/bundles";
import { BundleBuyButtons } from "@/components/bundles/BundleBuyButtons";
import { Price } from "@/components/ui/Price";

/**
 * A fixed bundle's own product page (card p6YVxc4P, requirement 3).
 *
 * A bundle is a PROMOTION over component lines, not a catalogue product, so this
 * page is built from the promotion rather than from a `products` row — which also
 * means nothing is written into a catalogue the nightly Zoey ingest owns.
 *
 * The prices shown are the catalogue's, signed out. A shopper on an account
 * contract price or a membership pays their own price and the bundle percentage
 * still applies to it — the CART is where that is decided, and the page says so
 * rather than quoting a figure that might be wrong for the reader.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const bundle = await loadBundle(slug).catch(() => null);
  return { title: bundle ? bundle.headline : "Bundle" };
}

export default async function BundlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const bundle = await loadBundle(slug).catch(() => null);
  if (!bundle) notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <nav className="mb-6 text-sm text-steel-500">
        <Link href="/bundles" className="hover:underline">
          Bundles
        </Link>
        <span className="mx-2">/</span>
        <span className="text-ink-700">{bundle.headline}</span>
      </nav>

      <h1 className="text-3xl font-bold text-ink-900">{bundle.headline}</h1>
      <p className="mt-2 text-sm font-medium text-brand">
        {bundle.percent}% off when you buy the bundle
      </p>
      {bundle.description && <p className="mt-4 text-steel-600">{bundle.description}</p>}

      <div className="mt-8 overflow-hidden rounded-lg border border-steel-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-steel-50 text-steel-600">
              <th className="px-4 py-2 text-left font-medium">What&rsquo;s in it</th>
              <th className="px-4 py-2 text-right font-medium">Qty</th>
              <th className="px-4 py-2 text-right font-medium">Price each</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-steel-100">
            {bundle.components.map((component) => (
              <tr key={component.sku} className="text-ink-700">
                <td className="px-4 py-3">
                  {component.slug ? (
                    <Link href={`/products/${component.slug}`} className="font-medium hover:underline">
                      {component.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{component.name}</span>
                  )}
                  <span className="mt-0.5 block text-xs text-steel-400">SKU: {component.sku}</span>
                  {component.missing && (
                    <span className="mt-1 block text-xs text-amber-700">
                      Not available on this site.
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">{component.quantity}</td>
                <td className="px-4 py-3 text-right">
                  {component.unitPrice != null ? <Price amount={component.unitPrice} /> : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 rounded-lg border border-steel-200 p-6">
        <div className="flex justify-between text-sm">
          <span className="text-steel-500">Components separately</span>
          <Price amount={bundle.componentTotal} className="font-medium" />
        </div>
        <div className="mt-2 flex justify-between text-sm">
          <span className="text-steel-500">Bundle saving ({bundle.percent}%)</span>
          <span className="font-medium text-brand">
            -<Price amount={bundle.saving} />
          </span>
        </div>
        <div className="mt-4 flex justify-between border-t border-steel-200 pt-4 text-base font-semibold">
          <span>Bundle price (ex GST)</span>
          <Price amount={bundle.bundleTotal} />
        </div>
        <p className="mt-2 text-xs text-steel-500">
          Prices shown are our standard prices. If you are signed in on your own account pricing,
          the bundle discount applies to your prices — your cart will show the exact figures.
        </p>

        <div className="mt-6">
          <BundleBuyButtons slug={bundle.slug} disabled={!bundle.addable} />
        </div>
        {!bundle.addable && (
          <p className="mt-3 text-sm text-amber-800">
            One of these products isn&rsquo;t available on this site, so the bundle can&rsquo;t be
            added right now.
          </p>
        )}
      </div>

      <p className="mt-6 text-sm text-steel-500">
        Each product is added to your cart as its own line, at its own price, so your invoice and
        your order history show exactly what you bought.
      </p>
    </div>
  );
}
