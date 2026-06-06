/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@monaco-editor/react'],
  async rewrites() {
    return [
      {
        source: '/ads/:path*',
        destination: 'https://www.highperformanceformat.com/:path*',
      },
      {
        source: '/ads-cpm/:path*',
        destination: 'https://pl29636579.effectivecpmnetwork.com/:path*',
      },
      {
        source: '/ads-cpm2/:path*',
        destination: 'https://pl29636580.effectivecpmnetwork.com/:path*',
      },
      {
        source: '/ads-cpm3/:path*',
        destination: 'https://pl29636581.effectivecpmnetwork.com/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
