import type { NextConfig } from "next";
import { localDevelopmentOrigins } from './src/lib/dev-origins';

const nextConfig: NextConfig = {
  allowedDevOrigins: process.env.NODE_ENV === 'development' ? localDevelopmentOrigins() : [],
  // A separate output directory lets development checks run without touching
  // the regular dev server's cache or lock.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  serverExternalPackages: ['pg', 'pdfkit', 'exceljs'],
  outputFileTracingIncludes: { '/api/v1/expenses/report': ['./public/fonts/**/*.ttf'] },
  async headers() {
    return [{ source: '/(.*)', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Content-Security-Policy', value: "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'" },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ...(process.env.NODE_ENV === 'production' ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }] : []),
    ] }];
  },
};

export default nextConfig;
