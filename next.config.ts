import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Keep the dev indicators badge from covering the mobile dock (bottom-left).
  devIndicators: false,
  experimental: {
    agentUpgrade: "security",
  },
  turbopack: {
    root: path.resolve(__dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
