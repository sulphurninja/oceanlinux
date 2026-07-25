/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // The codebase typechecks clean, so let the build fail on new type errors
    // instead of hiding them.
    ignoreBuildErrors: false,
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
        // Baseline hardening for every response.
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Stops the dashboard/admin panel being framed for clickjacking.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
        ],
      },
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
          // No Allow-Credentials here: this API authenticates with the
          // x-api-key/x-api-secret headers, never with the browser's cookies.
          // Pairing credentials:true with origin:* is also rejected by browsers
          // and would become a real data-theft hole if the origin were ever
          // narrowed to reflect the caller.
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,DELETE,PATCH,POST,PUT" },
          { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-api-key, x-api-secret" },
        ]
      }
    ]
  }
};

export default nextConfig;
