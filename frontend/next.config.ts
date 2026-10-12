import type { NextConfig } from "next";

// The browser talks to /api/* on the same origin; Next forwards it to Django.
// Django routes end with a slash, so it is added here. Uploaded photos live under /media.
const backend = process.env.BACKEND_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*/` },
      { source: "/media/:path*", destination: `${backend}/media/:path*` },
    ];
  },
};

export default nextConfig;
