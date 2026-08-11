import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['172.16.238.159', '*.local', 'localhost'],
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
