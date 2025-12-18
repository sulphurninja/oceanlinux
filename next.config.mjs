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
};

export default nextConfig;
