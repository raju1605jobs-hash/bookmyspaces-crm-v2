# DEPLOYMENT_AUDIT.md — Configuration (Part 9)

## package.json scripts

VERIFIED — `bookmyspaces/package.json` `"scripts"` block contains exactly 4 entries: `"dev": "next dev"`, `"build": "next build"`, `"start": "next start"`, `"lint": "next lint"`. **No `"test"` script exists.**

## Testing frameworks

VERIFIED — zero matches for `jest|vitest|playwright|cypress|testing-library` (case-insensitive) in `package.json` `dependencies` or `devDependencies`. VERIFIED — `find . -maxdepth 2 -iname "*.test.*" -o -iname "*.spec.*"` (excluding `node_modules`) returns zero files. No test configuration files (`jest.config.*`, `vitest.config.*`, `playwright.config.*`) found at the project root. **Conclusion: no automated testing of any kind exists in this project.**

## tsconfig.json (full content, VERIFIED)

```json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```
`strict: true` is set. Cross-reference CODE_METRICS.md for the extent to which `any` usage erodes this setting in practice.

## .eslintrc.json (full content, VERIFIED)

```json
{
  "extends": "next/core-web-vitals"
}
```
No custom rules, no `@typescript-eslint` strict/recommended additions, no `no-console` or `no-explicit-any` rule configured.

## next.config.js

VERIFIED (already captured in prior audit pass, re-confirmed present at `bookmyspaces/next.config.js`): `experimental.serverActions.allowedOrigins: ['*']`; `images.remotePatterns` allows `**.supabase.co`, `bookmyspaces.in`, `**.vercel.app`; `headers()` applies `Cache-Control: no-store, max-age=0` to all `/api/:path*` responses; no other security headers configured.

## Tailwind configuration — VERIFIED DUPLICATE/DIVERGENT FILES

Both `tailwind.config.ts` and `tailwind.config.js` exist at the project root simultaneously. VERIFIED both files share the same `content` glob array and the same `colors.gold`/`colors.luxury` palette definitions, but diverge on `fontFamily`:
- `tailwind.config.ts` (TypeScript, `theme.extend.fontFamily`): `display: ['var(--font-display)', 'Georgia', 'serif']`, `body: ['var(--font-body)', 'system-ui', 'sans-serif']`, `mono: ['var(--font-mono)', 'monospace']` — references CSS custom properties.
- `tailwind.config.js` (JavaScript, same keys): `display: ['Cormorant Garamond', 'Georgia', 'serif']`, `body: ['DM Sans', 'Segoe UI', 'Arial', 'system-ui', 'sans-serif']`, `mono: ['DM Mono', 'Consolas', 'Courier New', 'monospace']` — hardcodes literal font names instead.

Which file Next.js's built-in Tailwind integration actually resolves when both exist was NOT VERIFIED in this pass (would require inspecting the Next.js/Tailwind PostCSS resolution order at build time, which is standard tooling behavior external to this repository's source, not something this static read can confirm with certainty). `postcss.config.js` (VERIFIED, full content below) does not itself disambiguate — it references the `tailwindcss` plugin generically, not a specific config file path.

## postcss.config.js (full content, VERIFIED)

```js
/** @type {import('postcss').Config} */
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

## vercel.json (full content, VERIFIED)

```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "regions": ["bom1"],
  "functions": {
    "src/app/api/chat/route.ts": { "maxDuration": 30 },
    "src/app/api/ai-summary/route.ts": { "maxDuration": 60 },
    "src/app/api/proposals/route.ts": { "maxDuration": 30 },
    "src/app/api/knowledge/route.ts": { "maxDuration": 60 },
    "src/app/api/analytics/route.ts": { "maxDuration": 30 },
    "src/app/api/followups/route.ts": { "maxDuration": 30 },
    "src/app/api/cron/followups/route.ts": { "maxDuration": 30 }
  },
  "crons": [{ "path": "/api/cron/followups", "schedule": "0 9 * * *" }]
}
```
Region: Mumbai (`bom1`). One scheduled cron job, daily at 09:00 (server timezone NOT VERIFIED — Vercel cron schedules run in UTC per Vercel's documented behavior, which is external platform behavior not re-derivable from this repo; treat as PARTIALLY VERIFIED).

## .vercel/repo.json (full content, VERIFIED, located one directory above `bookmyspaces/` at the outer repo root)

```json
{
  "remoteName": "origin",
  "projects": [
    {
      "id": "prj_vPu7G6TdphNVZOgkFPBgSB4TFXY2",
      "name": "bookmyspaces-crm-v2",
      "directory": "bookmyspaces",
      "orgId": "team_l1bpsTftKKB8A2gZZJE4xQVJ"
    }
  ]
}
```

## UNINSPECTED ITEMS (Part 9 scope)

- Exact Tailwind config file precedence (`.ts` vs `.js`) when both exist — flagged above as PARTIALLY VERIFIED / not resolvable from static file inspection alone.
- Vercel cron timezone behavior — flagged above as PARTIALLY VERIFIED (relies on documented external platform behavior, not repo-internal evidence).
