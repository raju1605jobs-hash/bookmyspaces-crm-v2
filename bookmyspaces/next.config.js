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
      // ISS-034 (audit/MASTER_ISSUE_REGISTER.csv): baseline security headers applied
      // to every route. These are the low-risk subset — they don't change how the
      // site renders or behaves, so no manual click-through is required.
      // A stricter Content-Security-Policy header is deliberately NOT added here yet:
      // the audit itself flags CSP as needing a full manual click-through test in a
      // real browser first, since it can silently break inline scripts/styles/third-
      // party embeds (fonts, chat widget) if tuned incorrectly.
      {
        source: '/:path*',
        headers: [
          // Stops other sites from embedding this app in an <iframe> (clickjacking).
          { key: 'X-Frame-Options', value: 'DENY' },
          // Stops the browser from guessing/re-interpreting file types (MIME-sniffing).
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Limits how much of this site's URL is leaked to other sites via the
          // Referer header when a link is clicked.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Disables browser features this app doesn't use, so they can't be abused
          // if a third-party script were ever injected.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
