import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { getSiteConfig, getFeatureFlag, getFooterConfig, getTopCategories, getKlaviyoPublicKey, getGa4MeasurementId } from "@/lib/store";
import { getPublishedTokenVars } from "@/lib/design-tokens";
import { KlaviyoTracking } from "@/components/analytics/KlaviyoTracking";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { siteBaseUrl } from "@/lib/seo";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { GstProvider } from "@/lib/gst";
import { CartQuoteCountsProvider } from "@/lib/cart-quote-counts";
import { GST_COOKIE, parseGstInclusive } from "@/lib/gst-cookie";
import "./globals.css";

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export async function generateMetadata(): Promise<Metadata> {
  const { site, channel } = await getSiteConfig();
  return {
    metadataBase: new URL(siteBaseUrl(site?.url)),
    title: site?.metaTitle || channel?.name || "Store",
    description: site?.metaDescription || `Welcome to ${channel?.name || "our store"}`,
    icons: site?.faviconUrl ? { icon: site.faviconUrl } : undefined,
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Chrome-free branch for the portal-embedded CMS render surface (/render/*,
  // tagged by src/proxy.ts). Same html/body/providers so client components and
  // styling behave identically — just no Header/Footer/analytics.
  const isCmsRender = (await headers()).get("x-cms-render") === "1";
  if (isCmsRender) {
    const [pricesIncludeTax, cookieStore] = await Promise.all([
      getFeatureFlag("prices_include_tax"),
      cookies(),
    ]);
    const gstInclusive = parseGstInclusive(cookieStore.get(GST_COOKIE)?.value);
    return (
      <html lang="en">
        <body className="min-h-screen bg-white text-zinc-900 antialiased">
          <GstProvider initialInclusive={gstInclusive} pricesIncludeTax={pricesIncludeTax}>
            <CartQuoteCountsProvider>{children}</CartQuoteCountsProvider>
          </GstProvider>
        </body>
      </html>
    );
  }

  const [{ site, channel }, subscriptionsEnabled, footerConfig, topCategories, pricesIncludeTax, cookieStore, klaviyoPublicKey, ga4MeasurementId, tokenVars] = await Promise.all([
    getSiteConfig(),
    getFeatureFlag("subscriptions_enabled"),
    getFooterConfig(),
    getTopCategories(),
    getFeatureFlag("prices_include_tax"),
    cookies(),
    getKlaviyoPublicKey(),
    getGa4MeasurementId(),
    getPublishedTokenVars(),
  ]);
  const storeName = site?.siteName || channel?.name || "Store";
  const logoUrl = site?.logoUrl || null;
  const logoAlt = site?.logoAlt || null;
  const gstInclusive = parseGstInclusive(cookieStore.get(GST_COOKIE)?.value);

  return (
    <html lang="en" style={(tokenVars ?? undefined) as React.CSSProperties | undefined}>
      <body className="min-h-screen flex flex-col bg-white text-zinc-900 antialiased">
        <GstProvider initialInclusive={gstInclusive} pricesIncludeTax={pricesIncludeTax}>
          <CartQuoteCountsProvider>
            <Header
              storeName={storeName}
              logoUrl={logoUrl}
              logoAlt={logoAlt}
              navCategories={topCategories.slice(0, 6)}
            />
            <main className="flex-1">{children}</main>
            <Footer storeName={storeName} config={footerConfig} />
          </CartQuoteCountsProvider>
        </GstProvider>
        <KlaviyoTracking publicKey={klaviyoPublicKey} />
        <GoogleAnalytics measurementId={ga4MeasurementId} />
      </body>
    </html>
  );
}
