import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  turbopack: {
    // An unrelated project's lockfile in the parent directory (~/package-lock.json)
    // otherwise makes Turbopack's auto-detection guess the wrong workspace root.
    root: path.join(__dirname),
  },
};

export default nextConfig;
