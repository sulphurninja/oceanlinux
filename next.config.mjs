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
