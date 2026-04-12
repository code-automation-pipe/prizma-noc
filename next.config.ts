import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@azure/msal-node'],
};

export default nextConfig;
