// src/instrumentation.ts
// ─────────────────────────────────────────────────────────────────────────────
// ISS-050 (audit/MASTER_ISSUE_REGISTER.csv): "no one-click install / setup
// wizard / startup env validation." A full setup wizard is out of scope for
// a remediation pass, but the startup env validation half is cheap and
// high-value: Next.js's instrumentation hook (stable since 14.1, no flag
// needed) runs this once when the server process boots, in every runtime
// (Node.js server, Edge, and during `next build`'s prerender pass) — so a
// misconfigured deployment fails loudly at boot instead of on whichever
// request happens to touch the missing var first.
//
// Deliberately scoped to the Node.js runtime only: the required env vars
// (Supabase service role key, Anthropic key) are server-only secrets that
// are never available to the Edge runtime anyway, and re-running this in
// Edge would either double-log or throw for the wrong reason.
// ─────────────────────────────────────────────────────────────────────────────

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { assertEnv } = await import('./lib/env')
    assertEnv()
  }
}
