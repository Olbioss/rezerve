import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The iyzipay SDK dynamically requires files from its own lib/resources
  // directory, which bundlers can't statically resolve — load it via Node.
  serverExternalPackages: ["iyzipay"],
  // ...and for the same reason output tracing never sees those files, so a
  // deployed function had the SDK without its resources: every payment
  // failed with ENOENT on lib/resources. They only require their shared
  // base, which lib/payments/iyzico.ts imports so its dependencies trace.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/iyzipay/lib/resources/*.js"],
  },
};

export default nextConfig;
