import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { getSiteConfig, getFeatureFlag, getFooterConfig, getHeaderNav, getHeaderConfig, getGa4MeasurementId } from "@/lib/store";
import { getPublishedTokenVars } from "@/lib/design-tokens";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { SpecialistButton } from "@/components/layout/SpecialistButton";
import { GstProvider } from "@/lib/gst";
import { GST_COOKIE, parseGstInclusive } from "@/lib/gst-cookie";
import { siteBaseUrl } from "@/lib/seo";
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
    // Favicon is provided by app/icon.tsx — it uses faviconUrl when set,
    // otherwise generates one from the logo.
    // Build/test site — keep it out of search engines until it goes live.
    robots: { index: false, follow: false },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Chrome-free branch for the portal-embedded CMS render surface (/render/*,
  // tagged by src/proxy.ts). Same html/body/providers so client components and
  // styling behave identically — just no Header/Footer/SpecialistButton.
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
            {children}
          </GstProvider>
        </body>
      </html>
    );
  }

  const [
    { site, channel },
    subscriptionsEnabled,
    footerConfig,
    headerNav,
    headerConfig,
    pricesIncludeTax,
    cookieStore,
    tokenVars,
    ga4MeasurementId,
  ] = await Promise.all([
    getSiteConfig(),
    getFeatureFlag("subscriptions_enabled"),
    getFooterConfig(),
    getHeaderNav(),
    getHeaderConfig(),
    getFeatureFlag("prices_include_tax"),
    cookies(),
    getPublishedTokenVars(),
    getGa4MeasurementId(),
  ]);
  const storeName = site?.siteName || channel?.name || "Store";
  const logoUrl = site?.logoUrl || null;
  const logoAlt = site?.logoAlt || null;
  const gstInclusive = parseGstInclusive(cookieStore.get(GST_COOKIE)?.value);

  return (
    <html lang="en" style={(tokenVars ?? undefined) as React.CSSProperties | undefined}>
      <body className="min-h-screen flex flex-col bg-white text-zinc-900 antialiased">
        <GstProvider initialInclusive={gstInclusive} pricesIncludeTax={pricesIncludeTax}>
          <Header
            storeName={storeName}
            logoUrl={logoUrl}
            logoAlt={logoAlt}
            nav={headerNav}
            config={headerConfig}
          />
          <main className="flex-1">{children}</main>
          <Footer storeName={storeName} config={footerConfig} />
          <SpecialistButton phone={headerConfig.phone} />
        </GstProvider>
        <GoogleAnalytics measurementId={ga4MeasurementId} />
      </body>
    </html>
  );
}
