/** @type {import('next').NextConfig} */
const nextConfig = {
  // ISS-033 (audit/MASTER_ISSUE_REGISTER.csv): was ['*'] — any origin could invoke
  // Server Actions on behalf of a logged-in user's browser session (CSRF exposure).
  // Restricted to the real production domain, Vercel preview deployments, and
  // localhost for development. Update this list if a custom domain is added.
  experimental: {
    serverActions: {
      allowedOrigins: [
        'bookmyspaces.in',
        'www.bookmyspaces.in',
        '*.vercel.app',
        'localhost:3000',
      ],
    },
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'bookmyspaces.in' },
      { protocol: 'https', hostname: '**.vercel.app' },
    ],
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
