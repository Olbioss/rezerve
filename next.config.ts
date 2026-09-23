import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The iyzipay SDK dynamically requires files from its own lib/resources
  // directory, which bundlers can't statically resolve — load it via Node.
  serverExternalPackages: ["iyzipay"],
};

export default nextConfig;
