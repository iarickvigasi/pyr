import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@pyr/shared'],
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
    return [
      {
        source: '/api/v1/admin/queues/:path*',
        destination: `${apiUrl}/api/v1/admin/queues/:path*`,
      },
      {
        source: '/api/admin/queues/:path*',
        destination: `${apiUrl}/api/v1/admin/queues/:path*`,
      },
    ];
  },
};

export default nextConfig;
