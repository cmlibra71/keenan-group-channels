import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@keenan/services"],
  images: {
    loader: "custom",
    loaderFile: "./src/lib/image-loader.ts",
    imageSizes: [100, 200, 400, 600],
    deviceSizes: [800, 1200, 1600],
  },
};

export default nextConfig;
