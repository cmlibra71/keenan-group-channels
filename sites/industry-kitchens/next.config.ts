import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
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
};

export default nextConfig;
