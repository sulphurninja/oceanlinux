/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true, // Ignore TypeScript errors during build
  },
  // Handle native node modules (ssh2, cpu-features) - exclude from webpack bundling
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Mark native modules as external - they'll be required at runtime instead of bundled
      config.externals = config.externals || [];
      config.externals.push({
        'ssh2': 'commonjs ssh2',
        'cpu-features': 'commonjs cpu-features',
      });
    }
    return config;
  },
  // Ensure node-ssh only runs on server
  experimental: {
    serverComponentsExternalPackages: ['node-ssh', 'ssh2', 'cpu-features'],
  },
  async headers() {
    return [
      {
        source: "/company/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, max-age=0" },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" },
        ],
      },
      {
        source: "/api/company/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, max-age=0" },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" },
          { key: "X-Company-Orders-Filter", value: "paid-orders-v6" },
        ],
      },
      {
        // matching all API routes
        source: "/api/v1/reseller/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,DELETE,PATCH,POST,PUT" },
          { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-api-key, x-api-secret" },
        ]
      }
    ]
  }
};

export default nextConfig;
