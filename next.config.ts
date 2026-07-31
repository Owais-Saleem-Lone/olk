import path from "path";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

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

// Only uploads source maps (readable stack traces in Sentry) when
// SENTRY_AUTH_TOKEN is set -- without it, this wrapper just passes the
// config through unchanged, so local dev and CI need no Sentry setup at all.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  webpack: {
    treeshake: { removeDebugLogging: true },
  },
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
