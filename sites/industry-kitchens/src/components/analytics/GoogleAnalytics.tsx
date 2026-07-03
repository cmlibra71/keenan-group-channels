"use client";

import Script from "next/script";

/**
 * Loads the GA4 gtag.js tag for this storefront. Renders nothing when the channel
 * has no Measurement ID (GA4 not configured). Placed once in the root layout;
 * installs window.gtag/dataLayer that the ga4.ts client helpers push to.
 */
export function GoogleAnalytics({ measurementId }: { measurementId: string | null | undefined }) {
  if (!measurementId) return null;
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${measurementId}');`}
      </Script>
    </>
  );
}
