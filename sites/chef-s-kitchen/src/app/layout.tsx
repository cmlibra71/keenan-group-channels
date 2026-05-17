import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { getSiteConfig, getFeatureFlag } from "@/lib/store";
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
    verification: {
      google: "BZrPnn49pyvvgUtV8Tt1WWQOm16FAHdGefsJ834ifac",
    },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [{ site, channel }, subscriptionsEnabled] = await Promise.all([
    getSiteConfig(),
    getFeatureFlag("subscriptions_enabled"),
  ]);
  const storeName = site?.siteName || channel?.name || "Store";
  const logoUrl = site?.logoUrl || null;
  const logoAlt = site?.logoAlt || null;

  return (
    <html lang="en">
      <Script
        id="google-tag-manager"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{
          __html: `
(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-TR7SC2JH');
          `.trim(),
        }}
      />
      <body className="min-h-screen flex flex-col bg-surface-primary text-text-body antialiased">
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-TR7SC2JH"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        <Header storeName={storeName} logoUrl={logoUrl} logoAlt={logoAlt} />
        <main className="flex-1">{children}</main>
        <Footer storeName={storeName} subscriptionsEnabled={subscriptionsEnabled} />
      </body>
    </html>
  );
}
