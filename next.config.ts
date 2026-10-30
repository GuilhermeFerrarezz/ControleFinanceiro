import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['sequelize', 'sqlite3'],
  async headers() {
    return [{ source: '/(.*)', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Frame-Options', value: 'DENY' },
    ] }];
  },
};

export default nextConfig;
