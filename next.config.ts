import type { NextConfig } from "next";
import path from "node:path";
import { IMAGE_HOSTS } from "./src/lib/images";

const nextConfig: NextConfig = {
  images: {
    // Official Parliament hosts only (member portraits, party logos, news covers).
    remotePatterns: IMAGE_HOSTS.map((hostname) => ({ protocol: "https" as const, hostname })),
  },
  poweredByHeader: false,
  turbopack: { root: path.resolve(".") },
};

export default nextConfig;
