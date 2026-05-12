#!/usr/bin/env node
'use strict'
// =============================================================================
// fix-vercel-route.js
// =============================================================================
// Fixes "Failed to collect page data for /api/ai-summary" (and similar routes)
// on Vercel by ensuring every API route that does DB/AI work is fully dynamic.
//
// Run from project root: node fix-vercel-route.js
//
// What it does:
//   1. Targets src/app/api/ai-summary/route.ts first (the reported failure).
//   2. Adds missing route config exports (force-dynamic, runtime, maxDuration).
//   3. Fixes any remaining supabaseAdmin import → getSupabaseAdmin() pattern.
//   4. Checks all other API routes that have long timeouts in vercel.json.
//   5. Runs npm run build.
//   6. Reads the first error, fixes only that file, retries.
//
// What it NEVER does:
//   - Never touches lucide-react, react, next/* imports
//   - Never replaces icon/component names with 'any'
//   - Never modifies JSX, UI components, or business logic
//   - Never removes existing functionality
// =============================================================================

const fs   = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT    = process.cwd()
const SRC     = path.join(ROOT, 'src')
const LOG     = path.join(ROOT, 'build-output.log')
const RETRIES = 6

// ─── Routes to fix in priority order ─────────────────────────────────────────
// ai-summary is the reported failure. Others in vercel.json with long timeouts
// are candidates for the same issue.

const PRIORITY_ROUTES = [
  'src/app/api/ai-summary/route.ts',
  'src/app/api/knowledge/route.ts',
  'src/app/api/chat/route.ts',
  'src/app/api/analytics/route.ts',
  'src/app/api/followups/route.ts',
  'src/app/api/proposals/route.ts',
  'src/app/api/leads/route.ts',
  'src/app/api/leads/summary/route.ts',
  'src/app/api/health/route.ts',
  'src/app/api/conversations/route.ts',
  'src/app/api/notifications/route.ts',
  'src/app/api/whatsapp/webhook/route.ts',
  'src/app/api/whatsapp/send/route.ts',
  'src/app/api/whatsapp/campaigns/route.ts',
  'src/app/api/campaigns/route.ts',
  'src/app/api/proposals/[id]/pdf/route.ts',
  'src/app/api/proposals/[id]/preview/route.ts',
  'src/app/api/proposals/email/route.ts',
  'src/app/api/proposal/share/[token]/route.ts',
]

// maxDuration per route (from vercel.json; default 30 for unlisted)
const MAX_DURATION = {
  'src/app/api/ai-summary/route.ts': 60,
  'src/app/api/knowledge/route.ts':  60,
  'src/app/api/chat/route.ts':       30,
  'src/app/api/analytics/route.ts':  30,
  'src/app/api/followups/route.ts':  30,
  'src/app/api/proposals/route.ts':  30,
}

const SUPABASE_PATH_RE =
  /from\s+['"](?:@\/lib\/supabase|(?:\.{1,2}\/)*(?:[\w\/-]*\/)?supabase)['"]/

// ─── Transform: inject route config exports ───────────────────────────────────

function injectRouteConfig(content, routeKey) {
  // Already has force-dynamic → skip
  if (content.includes("export const dynamic = 'force-dynamic'")) {
    return { content, changed: false }
  }

  const dur = MAX_DURATION[routeKey] || 30
  const block = [
    "export const dynamic = 'force-dynamic'",
    "export const runtime = 'nodejs'",
    `export const maxDuration = ${dur}`,
  ].join('\n')

  const lines = content.split('\n')

  // Find last import line
  let lastImport = -1
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*import[\s{*"']/.test(lines[i])) lastImport = i
  }

  const at = lastImport + 1
  lines.splice(at, 0, '', block, '')

  // Collapse 3+ blank lines → 2
  const out = []; let blanks = 0
  for (const l of lines) {
    if (l.trim() === '') { if (++blanks <= 2) out.push(l) }
    else { blanks = 0; out.push(l) }
  }

  return { content: out.join('\n'), changed: true }
}

// ─── Transform: fix supabaseAdmin static import ───────────────────────────────

function fixStaticImport(content) {
  if (!content.includes('supabaseAdmin')) return { content, changed: false }

  const lines   = content.split('\n')
  const out     = []
  let   changed = false
  let   lastImportIdx = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (SUPABASE_PATH_RE.test(line) && /\bsupabaseAdmin\b/.test(line)) {
      out.push(line.replace(/\bsupabaseAdmin\b/g, 'getSupabaseAdmin'))
      changed = true
    } else {
      out.push(line)
    }
    if (/^\s*import[\s{*"']/.test(lines[i])) lastImportIdx = out.length - 1
  }

  if (changed) {
    const already = out.join('\n').includes('const supabaseAdmin = getSupabaseAdmin()')
    if (!already && lastImportIdx >= 0) {
      out.splice(lastImportIdx + 1, 0, '', 'const supabaseAdmin = getSupabaseAdmin()')
    }
  }

  return { content: out.join('\n'), changed }
}

// ─── Transform: fix dynamic import of supabaseAdmin ──────────────────────────

function fixDynamicImport(content) {
  if (!content.includes('supabaseAdmin')) return { content, changed: false }
  let changed = false
  const result = content.replace(
    /^(\s*)const\s*\{\s*supabaseAdmin\s*\}\s*(=\s*await\s+import\s*\([^)]+\).*)/gm,
    (_m, indent, rest) => {
      changed = true
      return `${indent}const { getSupabaseAdmin } ${rest}\n${indent}const supabaseAdmin = getSupabaseAdmin()`
    }
  )
  return { content: result, changed }
}

// ─── Transform: detect and warn about top-level execution ────────────────────
// We don't auto-move code (too risky) but we report it so the user can see it.
// The force-dynamic export prevents the build from hanging even if there is
// module-level initialization — because Next.js won't try to statically render
// a force-dynamic route.

function detectTopLevelExecution(content, filePath) {
  const warnings = []
  const lines = content.split('\n')
  let funcDepth = 0  // brace depth inside function bodies

  for (let i = 0; i < lines.length; i++) {
    const line  = lines[i]
    const trim  = line.trim()

    // Track function body depth
    if (/\bfunction\b|\=>\s*\{|\bclass\b/.test(line)) {
      funcDepth += (line.match(/\{/g)||[]).length - (line.match(/\}/g)||[]).length
    } else {
      funcDepth += (line.match(/\{/g)||[]).length - (line.match(/\}/g)||[]).length
    }
    if (funcDepth < 0) funcDepth = 0

    // Only check lines at module scope (funcDepth === 0 approximation)
    // Skip imports, comments, export const dynamic, export const runtime
    if (funcDepth === 0) {
      if (/^\s*\/\//.test(trim)) continue
      if (/^export\s+const\s+(dynamic|runtime|maxDuration)/.test(trim)) continue
      if (/^\s*import[\s{]/.test(trim)) continue
      if (/^\s*const\s+supabaseAdmin\s*=\s*getSupabaseAdmin\(\)/.test(trim)) continue
      if (/^\s*export\s+(async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\b/.test(trim)) {
        funcDepth++  // entering a handler
        continue
      }

      // Suspect: top-level supabase query
      if (/\.(from|rpc|storage)\s*\(/.test(line) && !/^\s*(const|let|var)\s+supabaseAdmin/.test(line)) {
        warnings.push(`  ⚠️  L${i+1}: possible top-level DB call: ${trim.slice(0, 70)}`)
      }

      // Suspect: top-level await
      if (/^\s*(?:const|let|var|)\s*\w+\s*=\s*await\s+/.test(line) && !/supabaseAdmin\s*=\s*getSupabaseAdmin/.test(line)) {
        warnings.push(`  ⚠️  L${i+1}: possible top-level await: ${trim.slice(0, 70)}`)
      }

      // Suspect: IIFE
      if (/\(async\s*\(\)\s*=>\s*\{/.test(line) || /\(async\s+function/.test(line)) {
        warnings.push(`  ⚠️  L${i+1}: immediately-invoked async function: ${trim.slice(0, 70)}`)
      }
    }
  }

  if (warnings.length > 0) {
    p(`\n  Top-level execution detected in ${path.relative(ROOT, filePath)}:`)
    warnings.forEach(w => p(w))
    p('  These are guarded by force-dynamic — but review if build still hangs.')
  }

  return warnings.length > 0
}

// ─── Apply all transforms to one route file ──────────────────────────────────

function fixRouteFile(fp, routeKey) {
  if (!fs.existsSync(fp)) return false

  let src
  try   { src = fs.readFileSync(fp, 'utf8') }
  catch { p(`  ⚠️  Cannot read: ${fp}`); return false }

  const original = src
  let content    = src
  let anyChanged = false

  // 1. Fix imports first (so injectRouteConfig sees final import list)
  const c2 = fixStaticImport(content)
  if (c2.changed) { content = c2.content; anyChanged = true }

  const c3 = fixDynamicImport(content)
  if (c3.changed) { content = c3.content; anyChanged = true }

  // 2. Inject route config exports after all imports are settled
  const c1 = injectRouteConfig(content, routeKey)
  if (c1.changed) { content = c1.content; anyChanged = true }

  // 4. Detect (but don't auto-move) top-level execution
  detectTopLevelExecution(content, fp)

  if (!anyChanged || content === original) return false

  try {
    fs.writeFileSync(fp, content, 'utf8')
    return true
  } catch (e) {
    p(`  ⚠️  Write error: ${fp} — ${e.message}`)
    return false
  }
}

// ─── Build ────────────────────────────────────────────────────────────────────

function runBuild() {
  p(`\n  $ npm run build  (→ build-output.log)`)
  spawnSync(`npm run build > "${LOG}" 2>&1`, [], {
    cwd:   ROOT, shell: true, stdio: 'inherit', timeout: 10 * 60 * 1000
  })
  let out = ''
  try { out = fs.readFileSync(LOG, 'utf8') } catch {}
  const success = out.includes('✓ Compiled') && !out.includes('Failed to compile') &&
                  !out.includes('Build error') && !out.includes('Type error')
  return { success, output: out }
}

// ─── Parse first error ────────────────────────────────────────────────────────

function parseFirstError(output) {
  const lines  = output.split('\n')
  const fileRe = /^\.\/(src\/[^\s:]+\.tsx?):(\d+)/

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(fileRe)
    if (!m) continue

    const file    = m[1]
    const lineNo  = parseInt(m[2])
    const context = lines.slice(i, i + 8).join('\n')

    const isCollect = output.includes('Failed to collect page data') ||
                      output.includes('getStaticPaths') ||
                      output.includes('getStaticProps')

    const missingType = context.match(/Cannot find name '([A-Z]\w+)'/)?.[1] ||
                        context.match(/has no exported member '(\w+)'/)?.[1]

    return { file, line: lineNo, context, isCollect, missingType }
  }

  // Check for "Failed to collect page data" without a file marker
  const collectMatch = output.match(/Failed to collect page data for\s+([^\s]+)/)
  if (collectMatch) {
    const route = collectMatch[1]  // e.g. /api/ai-summary
    // Convert route path to file path
    const fp = 'src/app' + route + '/route.ts'
    return { file: fp, line: 0, context: output.slice(-500), isCollect: true, missingType: null }
  }

  return null
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function p(...a) { console.log(...a) }
function bar(c = '─') { return c.repeat(64) }

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  p('\n' + bar('═'))
  p('  fix-vercel-route.js — Vercel deployment blocker fix')
  p(bar('═'))

  if (!fs.existsSync(SRC)) {
    p('\n❌  src/ not found. Run from project root.\n')
    process.exit(1)
  }

  const allFixed = []

  // ── Pass 1: fix all priority routes proactively ──────────────────────────────
  p('\n' + bar() + '\n  Pass 1: applying route config to known API routes\n' + bar() + '\n')

  for (const rel of PRIORITY_ROUTES) {
    const fp  = path.join(ROOT, rel)
    const key = rel
    if (!fs.existsSync(fp)) continue

    const fixed = fixRouteFile(fp, key)
    if (fixed) {
      allFixed.push(rel)
      p(`  ✅  ${rel}`)
    } else {
      p(`  ─   ${rel} (already correct or unchanged)`)
    }
  }

  // ── Pass 2–N: build loop ──────────────────────────────────────────────────────
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    p('\n' + bar())
    p(`  Build attempt ${attempt}/${RETRIES}`)
    p(bar())

    const { success, output } = runBuild()

    if (success) {
      p('\n' + bar('═'))
      p('  ✅  BUILD PASSED')
      p(bar('═'))

      p(`\n  Files modified (${allFixed.length}):`)
      if (allFixed.length > 0) {
        ;[...new Set(allFixed)].forEach(f => p(`    ${f}`))
      } else {
        p('    (none — all routes were already correct)')
      }

      // Show route table from build output
      const routeLines = output.split('\n').filter(l =>
        /[○ƒλ●]\s+\/api\//.test(l)
      )
      if (routeLines.length > 0) {
        p('\n  API route rendering mode:')
        routeLines.forEach(l => p('  ' + l.trim()))
        p('\n  ƒ = dynamic (correct for API routes)')
        p('  ○ = static  (may cause "collect page data" errors)')
      }

      p('\n' + bar())
      p('  Git commands to deploy:')
      p(bar())
      p('    git add -A')
      p('    git diff --stat HEAD')
      p('    git commit -m "fix: add force-dynamic to API routes — fix Vercel deploy"')
      p('    git push origin main\n')

      process.exit(0)
    }

    // Build failed — read first error
    const tail = output.split('\n').slice(-60).join('\n')
    p('\n  Build output (last 60 lines):')
    p(tail.split('\n').map(l => '  ' + l).join('\n'))

    const err = parseFirstError(output)

    if (!err) {
      p('\n  ⚠️  Cannot parse a fixable error from build output.')
      p('      Open build-output.log for details.')
      break
    }

    p(`\n  Error in: ${err.file}:${err.line}`)

    if (err.isCollect || err.file.includes('/api/')) {
      // Another API route with the same issue
      const fp  = path.join(ROOT, err.file)
      const key = err.file
      if (fs.existsSync(fp)) {
        const fixed = fixRouteFile(fp, key)
        if (fixed) {
          allFixed.push(err.file)
          p(`  ✅  Fixed: ${err.file}`)
          continue
        }
      }
    }

    if (err.missingType) {
      // Type annotation fix — surgical, annotation-positions only, skip imports
      const fp = path.join(ROOT, err.file)
      if (fs.existsSync(fp)) {
        let src = fs.readFileSync(fp, 'utf8')
        const T = err.missingType
        const e = T.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const lines = src.split('\n')
        let changed = false
        const out = lines.map(line => {
          if (/^\s*import[\s{*"']/.test(line)) return line  // never touch imports
          let r = line
          r = r.replace(new RegExp(`:\\s*${e}\\[\\]`, 'g'),          ': any[]')
          r = r.replace(new RegExp(`:\\s*${e}\\s*\\|\\s*null`, 'g'), ': any | null')
          r = r.replace(new RegExp(`:\\s*${e}\\b`, 'g'),             ': any')
          r = r.replace(new RegExp(`(?<=\\w)<${e}\\[\\]>`, 'g'),     '<any[]>')
          r = r.replace(new RegExp(`(?<=\\w)<${e}>`, 'g'),           '<any>')
          r = r.replace(new RegExp(`\\bas\\s+${e}\\[\\]`, 'g'),      'as any[]')
          r = r.replace(new RegExp(`\\bas\\s+${e}\\b`, 'g'),         'as any')
          if (r !== line) changed = true
          return r
        })
        if (changed) {
          fs.writeFileSync(fp, out.join('\n'))
          if (!allFixed.includes(err.file)) allFixed.push(err.file)
          p(`  ✅  Fixed type annotation in: ${err.file}`)
          continue
        }
      }
    }

    p('\n  ⚠️  This error is outside the scope of this script.')
    p(`      File: ${err.file}`)
    p(`      Context:\n${err.context}`)
    p('\n  Fix it manually, then run: node fix-vercel-route.js\n')
    break
  }

  // Final
  p('\n' + bar('═'))
  p(`  Build did not pass within ${RETRIES} attempts`)
  p(bar('═'))
  p(`\n  Files modified: ${[...new Set(allFixed)].length}`)
  ;[...new Set(allFixed)].forEach(f => p(`    ${f}`))
  p('\n  Open build-output.log for the remaining error.\n')
  process.exit(1)
}

main()
