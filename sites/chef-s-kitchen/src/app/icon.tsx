import { ImageResponse } from "next/og";
import { getSiteConfig } from "@/lib/store";

// Dynamic favicon. Uses the site's configured faviconUrl when set (portal:
// Storefront > Logo); otherwise falls back to the brand-green "C" monogram
// (the previous static app/icon.svg, which — being file-based metadata — used
// to override the data-driven icon entirely).
export const size = { width: 64, height: 64 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function Icon() {
  const { site } = await getSiteConfig();
  const src = site?.faviconUrl;
  const headers = {
    "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
  };

  if (!src) {
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            alignItems: "center",
            justifyContent: "center",
            background: "#45854d",
            borderRadius: 12,
            color: "#ffffff",
            fontSize: 42,
            fontWeight: 700,
          }}
        >
          C
        </div>
      ),
      { ...size, headers }
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={56} height={56} style={{ objectFit: "contain" }} alt="" />
      </div>
    ),
    { ...size, headers }
  );
}
