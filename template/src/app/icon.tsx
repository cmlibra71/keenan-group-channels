import { ImageResponse } from "next/og";
import { getSiteConfig } from "@/lib/store";

// Dynamic favicon. Uses the site's configured faviconUrl when set (portal:
// Storefront > Logo); otherwise derives an icon from the logo so every channel
// has a favicon. Falls back to a monogram if neither is available.
export const size = { width: 64, height: 64 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function Icon() {
  const { site } = await getSiteConfig();
  const src = site?.faviconUrl || site?.logoUrl;
  const headers = {
    "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
  };

  if (!src) {
    const letter = (site?.siteName || "S").trim().charAt(0).toUpperCase() || "S";
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            alignItems: "center",
            justifyContent: "center",
            background: "#18181b",
            color: "#ffffff",
            fontSize: 42,
            fontWeight: 700,
          }}
        >
          {letter}
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
