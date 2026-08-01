import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Blue-green deploys: clients bake in the build's git sha and send it as
  // x-deployment-id on RSC/server-action requests (and ?dpl= on assets), which
  // Caddy matches to route old-build requests to the draining container.
  deploymentId: process.env.GIT_SHA || undefined,
  transpilePackages: ["@keenan/services"],
  serverExternalPackages: ["sharp"],
  // Type errors FAIL the build — this is what prevents the snake_case/camelCase
  // service-result bug class (and others) from shipping silently. Keep at false.
  typescript: { ignoreBuildErrors: false },
  images: {
    loader: "custom",
    loaderFile: "./src/lib/image-loader.ts",
    imageSizes: [100, 200, 400, 600, 800],
    deviceSizes: [1024, 1280, 1600],
  },
  // Baseline security headers applied to every response.
  // TODO: add a Content-Security-Policy once the inline GTM/dataLayer bootstrap
  // (see src/app/layout.tsx) is moved to a nonce or hash so a strict policy
  // doesn't break analytics.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
