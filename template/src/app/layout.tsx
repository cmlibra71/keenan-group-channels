import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { getSiteConfig, getFeatureFlag, getFooterConfig, getTopCategories } from "@/lib/store";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { GstProvider } from "@/lib/gst";
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
  const [{ site, channel }, subscriptionsEnabled, footerConfig, topCategories, pricesIncludeTax, cookieStore] = await Promise.all([
    getSiteConfig(),
    getFeatureFlag("subscriptions_enabled"),
    getFooterConfig(),
    getTopCategories(),
    getFeatureFlag("prices_include_tax"),
    cookies(),
  ]);
  const storeName = site?.siteName || channel?.name || "Store";
  const logoUrl = site?.logoUrl || null;
  const logoAlt = site?.logoAlt || null;
  const gstInclusive = cookieStore.get("gst_inclusive")?.value === "true";

  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-white text-zinc-900 antialiased">
        <GstProvider initialInclusive={gstInclusive} pricesIncludeTax={pricesIncludeTax}>
          <Header
            storeName={storeName}
            logoUrl={logoUrl}
            logoAlt={logoAlt}
            navCategories={topCategories.slice(0, 6)}
          />
          <main className="flex-1">{children}</main>
          <Footer storeName={storeName} config={footerConfig} />
        </GstProvider>
      </body>
    </html>
  );
}
