import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['172.16.238.159', '*.local', 'localhost'],
  experimental: {
    // Turbopack's on-disk dev cache (a RocksDB-style store under
    // .next/dev/cache/turbopack) gets its files locked by Windows Defender's
    // real-time scanner and next dev then crashes with "Access is denied"
    // trying to open it. Disabling it avoids the lock entirely — dev cold
    // starts are a bit slower without cross-session caching, but the server
    // no longer crashes on launch.
    turbopackFileSystemCacheForDev: false,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost/crm/public/api/:path*',
      },
    ];
  },
};

export default nextConfig;
