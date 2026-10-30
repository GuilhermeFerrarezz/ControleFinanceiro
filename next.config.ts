import type { NextConfig } from "next";
import { localDevelopmentOrigins } from './src/lib/dev-origins';

const nextConfig: NextConfig = {
  allowedDevOrigins: process.env.NODE_ENV === 'development' ? localDevelopmentOrigins() : [],
  // A separate output directory lets development checks run without touching
  // the regular dev server's cache or lock.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  serverExternalPackages: ['pg'],
  async headers() {
    return [{ source: '/(.*)', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Frame-Options', value: 'DENY' },
    ] }];
  },
};

export default nextConfig;
