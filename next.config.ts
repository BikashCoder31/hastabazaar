import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: process.env.DEPLOY_TARGET === 'babal' ? 'standalone' : undefined,
  experimental: {
    serverActions: {
      bodySizeLimit: '28mb',
    },
  },
};

export default nextConfig;
