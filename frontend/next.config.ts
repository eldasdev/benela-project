import type { NextConfig } from "next";

function normalizeApiOrigin(value: string | undefined): string {
  if (!value) return "";
  const normalized = value.trim().replace(/\/+$/, "");
  return normalized.replace(/\/api$/i, "");
}

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async rewrites() {
    const apiOrigin = normalizeApiOrigin(process.env.API_PROXY_TARGET);
    if (!apiOrigin || !/^https?:\/\//i.test(apiOrigin)) {
      return [];
    }

    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        has: [{ type: "header", key: "accept", value: ".*text/html.*" }],
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
