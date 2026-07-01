import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { getSiteConfig, getFeatureFlag, getFooterConfig, getHeaderNav, getHeaderConfig } from "@/lib/store";
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
  const [
    { site, channel },
    subscriptionsEnabled,
    footerConfig,
    headerNav,
    headerConfig,
    pricesIncludeTax,
    cookieStore,
  ] = await Promise.all([
    getSiteConfig(),
    getFeatureFlag("subscriptions_enabled"),
    getFooterConfig(),
    getHeaderNav(),
    getHeaderConfig(),
    getFeatureFlag("prices_include_tax"),
    cookies(),
  ]);
  const storeName = site?.siteName || channel?.name || "Store";
  const logoUrl = site?.logoUrl || null;
  const logoAlt = site?.logoAlt || null;
  const gstInclusive = parseGstInclusive(cookieStore.get(GST_COOKIE)?.value);

  return (
    <html lang="en">
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
      </body>
    </html>
  );
}
