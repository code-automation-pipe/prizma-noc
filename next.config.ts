import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@azure/msal-node'],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
