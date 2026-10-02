import type { NextConfig } from "next";

/**
 * Sent on every response. Nothing here is ever framed — iyzico's checkout is
 * a full-page redirect, not an iframe — so the panel and the login page can
 * refuse framing outright. Vercel already adds HSTS. A script-src policy
 * would need per-request nonces and is deliberately not attempted.
 */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  // The iyzipay SDK dynamically requires files from its own lib/resources
  // directory, which bundlers can't statically resolve — load it via Node.
  serverExternalPackages: ["iyzipay"],
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
