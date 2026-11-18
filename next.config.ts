import type { NextConfig } from "next";
import { localDevelopmentOrigins } from './src/lib/dev-origins';

if (process.env.VERCEL_ENV === 'production' && process.env.RESEND_SANDBOX_TO?.trim()) {
  throw new Error('O sandbox do Resend recebe links de todas as contas. Use-o em Preview. Em Production, remova RESEND_SANDBOX_TO e configure o remetente verificado.');
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
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
      // HTML receives a per-request script nonce from Proxy. API and static
      // responses never need to execute scripts when opened as documents.
      { key: 'Content-Security-Policy', value: "default-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'" },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ...(process.env.NODE_ENV === 'production' ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }] : []),
    ] }];
  },
};

export default nextConfig;
