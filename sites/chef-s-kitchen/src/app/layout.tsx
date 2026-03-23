import type { Metadata } from "next";
import Script from "next/script";
import { getSiteConfig } from "@/lib/store";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import "./globals.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { site, channel } = await getSiteConfig();
  return {
    title: site?.metaTitle || channel?.name || "Store",
    description: site?.metaDescription || `Welcome to ${channel?.name || "our store"}`,
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { site, channel } = await getSiteConfig();
  const storeName = site?.siteName || channel?.name || "Store";

  return (
    <html lang="en">
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-Y5ZDZGQ7ZB"
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-Y5ZDZGQ7ZB');
          `}
        </Script>
      </head>
      <body className="min-h-screen flex flex-col bg-white text-zinc-900 antialiased">
        <Header storeName={storeName} />
        <main className="flex-1">{children}</main>
        <Footer storeName={storeName} />
      </body>
    </html>
  );
}
