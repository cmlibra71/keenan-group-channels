import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { getSiteConfig, getFeatureFlag, getFooterConfig, getGa4MeasurementId } from "@/lib/store";
import { getPublishedTokenVars } from "@/lib/design-tokens";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { GstProvider } from "@/lib/gst";
import { GST_COOKIE, parseGstInclusive } from "@/lib/gst-cookie";
import { siteBaseUrl } from "@/lib/seo";
import "./globals.css";

// Design-system type stack: Fraunces (serif voice for hero/marketing/PDP
// titles), IBM Plex Sans (all UI/body), IBM Plex Mono (SKUs & specs).
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-fraunces",
  display: "swap",
});
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

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
  // Chrome-free branch for the portal-embedded CMS render surface (/render/*,
  // tagged by src/proxy.ts). Same html/fonts/body/providers so components and
  // the design system behave identically — just no Header/Footer/GTM.
  const isCmsRender = (await headers()).get("x-cms-render") === "1";
  if (isCmsRender) {
    const [pricesIncludeTax, cookieStore] = await Promise.all([
      getFeatureFlag("prices_include_tax"),
      cookies(),
    ]);
    const gstInclusive = parseGstInclusive(cookieStore.get(GST_COOKIE)?.value);
    return (
      <html lang="en" className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable}`}>
        <body className="min-h-screen bg-surface-primary text-text-body antialiased">
          <GstProvider initialInclusive={gstInclusive} pricesIncludeTax={pricesIncludeTax}>
            {children}
          </GstProvider>
        </body>
      </html>
    );
  }

  const [{ site, channel }, subscriptionsEnabled, pricesIncludeTax, footerConfig, cookieStore, tokenVars, ga4MeasurementId] = await Promise.all([
    getSiteConfig(),
    getFeatureFlag("subscriptions_enabled"),
    getFeatureFlag("prices_include_tax"),
    getFooterConfig(),
    cookies(),
    getPublishedTokenVars(),
    getGa4MeasurementId(),
  ]);
  const storeName = site?.siteName || channel?.name || "Store";
  const logoUrl = site?.logoUrl || null;
  const logoAlt = site?.logoAlt || null;
  const gstInclusive = parseGstInclusive(cookieStore.get(GST_COOKIE)?.value);

  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable}`}
      style={(tokenVars ?? undefined) as React.CSSProperties | undefined}
    >
      <head>
        {/* Google Tag Manager — inline bootstrap. Rendered as a raw <script>
            inside <head> (not next/script's beforeInteractive, which placed it
            as a direct child of <html> — invalid in React 19 / Next 16). */}
        <script
          id="google-tag-manager"
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
      </head>
      <body className="min-h-screen flex flex-col bg-surface-primary text-text-body antialiased">
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-TR7SC2JH"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        <GstProvider initialInclusive={gstInclusive} pricesIncludeTax={pricesIncludeTax}>
          <Header storeName={storeName} logoUrl={logoUrl} logoAlt={logoAlt} />
          <main className="flex-1">{children}</main>
          <Footer storeName={storeName} subscriptionsEnabled={subscriptionsEnabled} config={footerConfig} />
        </GstProvider>
        {/* GA4 gtag — direct, alongside GTM. Both share window.dataLayer (standard
            coexistence); the ecommerce funnel fires via gtag from the components. */}
        <GoogleAnalytics measurementId={ga4MeasurementId} />
      </body>
    </html>
  );
}
