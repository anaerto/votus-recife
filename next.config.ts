import type { NextConfig } from "next";

const allowIgnores = process.env.ALLOW_BUILD_IGNORES === "true";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: allowIgnores,
  },
  typescript: {
    ignoreBuildErrors: allowIgnores,
  },
};

export default nextConfig;
