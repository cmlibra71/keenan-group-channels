import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@keenan/services"],
  serverExternalPackages: ["sharp"],
  typescript: { ignoreBuildErrors: true },
  images: {
    loader: "custom",
    loaderFile: "./src/lib/image-loader.ts",
    imageSizes: [100, 200, 400, 600, 800],
    deviceSizes: [1024, 1280, 1600],
  },
};

export default nextConfig;
