import type { Metadata, Viewport } from "next";
import { getSiteConfig, getFeatureFlag, getFooterConfig, getHeaderNav, getHeaderConfig } from "@/lib/store";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
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
    // Build/test site — keep it out of search engines until it goes live.
    robots: { index: false, follow: false },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [{ site, channel }, subscriptionsEnabled, footerConfig, headerNav, headerConfig] =
    await Promise.all([
      getSiteConfig(),
      getFeatureFlag("subscriptions_enabled"),
      getFooterConfig(),
      getHeaderNav(),
      getHeaderConfig(),
    ]);
  const storeName = site?.siteName || channel?.name || "Store";
  const logoUrl = site?.logoUrl || null;
  const logoAlt = site?.logoAlt || null;

  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-white text-zinc-900 antialiased">
        <Header
          storeName={storeName}
          logoUrl={logoUrl}
          logoAlt={logoAlt}
          nav={headerNav}
          config={headerConfig}
        />
        <main className="flex-1">{children}</main>
        <Footer storeName={storeName} config={footerConfig} />
      </body>
    </html>
  );
}
