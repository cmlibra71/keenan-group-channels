"use client";

import Script from "next/script";

/**
 * Loads the Klaviyo onsite tracking snippet for this storefront. Renders nothing
 * when the channel has no public key (Klaviyo not connected). Placed once in the
 * root layout — enables "Active on Site", and installs the window.klaviyo queue
 * that the client event helpers (components/analytics/klaviyo.ts) push to.
 */
export function KlaviyoTracking({ publicKey }: { publicKey: string | null | undefined }) {
  if (!publicKey) return null;
  return (
    <Script
      id="klaviyo-onsite"
      strategy="afterInteractive"
      src={`https://static.klaviyo.com/onsite/js/${encodeURIComponent(publicKey)}/klaviyo.js`}
    />
  );
}
