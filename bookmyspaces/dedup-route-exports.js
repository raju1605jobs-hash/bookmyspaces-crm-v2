#!/usr/bin/env node
'use strict'
// =============================================================================
// dedup-route-exports.js
// =============================================================================
// Removes duplicate route config exports that were inserted by fix-vercel-route.js
//
// Safe rules:
//   - Only removes EXACT duplicates of these three exports:
//       export const dynamic = 'force-dynamic'
//       export const runtime = 'nodejs'
//       export const maxDuration = <number>
//   - Keeps the FIRST occurrence of each
//   - Never touches handlers, imports, business logic, JSX, or other exports
//   - Runs npm run build, repeats on any remaining duplicate export error
//
// Run from project root: node dedup-route-exports.js
// =============================================================================

const fs   = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT     = process.cwd()
const SRC      = path.join(ROOT, 'src')
const API_DIR  = path.join(SRC, 'app', 'api')
const LOG      = path.join(ROOT, 'build-output.log')
const RETRIES  = 5

// ─── Walk — only route.ts files under src/app/api ────────────────────────────

function walkRoutes(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walkRoutes(full, acc)
    else if (e.name === 'route.ts' || e.name === 'route.tsx') acc.push(full)
  }
  return acc
}

// ─── Core: remove duplicate route config exports ──────────────────────────────
//
// Matches ONLY these three specific patterns — nothing else:
//   export const dynamic     = 'force-dynamic'
//   export const runtime     = 'nodejs'
//   export const maxDuration = <integer>
//
// Strategy: single linear pass, track first occurrence of each, drop extras.

function deduplicateExports(content) {
  const lines = content.split('\n')
  const out   = []
  const seen  = { dynamic: false, runtime: false, maxDuration: false }
  let changed = false

  for (const line of lines) {
    const t = line.trim()

    if (/^export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/.test(t)) {
      if (seen.dynamic)     { changed = true; continue }
      seen.dynamic = true;    out.push(line)
    } else if (/^export\s+const\s+runtime\s*=\s*['"]nodejs['"]/.test(t)) {
      if (seen.runtime)     { changed = true; continue }
      seen.runtime = true;    out.push(line)
    } else if (/^export\s+const\s+maxDuration\s*=\s*\d+\s*$/.test(t)) {
      if (seen.maxDuration) { changed = true; continue }
      seen.maxDuration = true; out.push(line)
    } else {
      out.push(line)
    }
  }

  if (!changed) return { content, changed: false }

  // Collapse 3+ consecutive blank lines → 2
  const final = []; let blanks = 0
  for (const l of out) {
    if (l.trim() === '') { if (++blanks <= 2) final.push(l) }
    else { blanks = 0; final.push(l) }
  }

  return { content: final.join('\n'), changed: true }
}

// ─── Scan all route files ─────────────────────────────────────────────────────

function scanAndFix() {
  const routes  = walkRoutes(API_DIR)
  const fixed   = []

  for (const fp of routes) {
    let src
    try   { src = fs.readFileSync(fp, 'utf8') }
    catch { p(`  ⚠️  Cannot read: ${rel(fp)}`); continue }

    // Quick check: does it have more than one of any route export?
    const dynCount = (src.match(/^export\s+const\s+dynamic\s*=/gm) || []).length
    const rttCount = (src.match(/^export\s+const\s+runtime\s*=/gm) || []).length
    const durCount = (src.match(/^export\s+const\s+maxDuration\s*=/gm) || []).length

    if (dynCount <= 1 && rttCount <= 1 && durCount <= 1) continue  // already clean

    const { content, changed } = deduplicateExports(src)
    if (!changed) continue

    try {
      fs.writeFileSync(fp, content, 'utf8')
      fixed.push(rel(fp))
      p(`  ✅  ${rel(fp)}`)
      p(`       dynamic:×${dynCount}→1  runtime:×${rttCount}→1  maxDuration:×${durCount}→1`)
    } catch (e) {
      p(`  ⚠️  Write error ${rel(fp)}: ${e.message}`)
    }
  }

  return fixed
}

// ─── Build ────────────────────────────────────────────────────────────────────

function runBuild() {
  p(`\n  $ npm run build  (→ build-output.log)`)
  spawnSync(`npm run build > "${LOG}" 2>&1`, [], {
    cwd: ROOT, shell: true, stdio: 'inherit', timeout: 10 * 60 * 1000
  })
  let out = ''
  try { out = fs.readFileSync(LOG, 'utf8') } catch {}

  // Check for "duplicate identifier" or redefinition errors
  const isDuplicateErr = /(?:redefined|previous definition|Duplicate|already been declared)/i.test(out)
  const isBuildFailed  = /Failed to compile|Build error|Build failed/i.test(out)
  const success        = !isBuildFailed && !isDuplicateErr && out.includes('✓ Compiled')

  return { success, output: out, isDuplicateErr }
}

// ─── Parse which file has the duplicate error ─────────────────────────────────

function parseDuplicateError(output) {
  // Vercel/webpack reports like: ./src/app/api/.../route.ts
  const fileRe = /\.\/(src\/app\/api\/[^\s:]+\.tsx?)/
  const lines  = output.split('\n')
  for (const line of lines) {
    const m = line.match(fileRe)
    if (m) return m[1]
  }
  // Also check "Import trace for requested module" pattern
  const traceRe = /Import trace for requested module:\s*\n\s*\.\/(src\/app\/api\/[^\s]+\.tsx?)/
  const tm = output.match(traceRe)
  if (tm) return tm[1]
  return null
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function p(...a)  { console.log(...a) }
function rel(fp)  { return path.relative(ROOT, fp) }
function bar(c='─') { return c.repeat(64) }

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  p('\n' + bar('═'))
  p('  dedup-route-exports.js — remove duplicate route config exports')
  p(bar('═'))

  if (!fs.existsSync(API_DIR)) {
    p(`\n❌  src/app/api/ not found. Run from project root.\n`)
    process.exit(1)
  }

  const allFixed = []

  // ── Pass 1: proactive scan of all API routes ───────────────────────────────
  p('\n' + bar() + '\n  Scanning src/app/api/**/route.ts\n' + bar() + '\n')

  const initial = scanAndFix()
  allFixed.push(...initial)

  if (initial.length === 0) p('  (no duplicates found in initial scan)')

  // ── Build loop ─────────────────────────────────────────────────────────────
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    p('\n' + bar())
    p(`  Build attempt ${attempt}/${RETRIES}`)
    p(bar())

    const { success, output, isDuplicateErr } = runBuild()

    if (success) {
      p('\n' + bar('═'))
      p('  ✅  BUILD PASSED')
      p(bar('═'))

      p(`\n  Files cleaned (${allFixed.length}):`)
      if (allFixed.length > 0) {
        ;[...new Set(allFixed)].forEach(f => p(`    ${f}`))
      } else {
        p('    (none — no duplicates were found)')
      }

      // Show API route rendering mode from build output
      const routeLines = output.split('\n')
        .filter(l => /[○ƒλ]\s+\/api\//.test(l))
        .slice(0, 20)
      if (routeLines.length > 0) {
        p('\n  API routes:')
        routeLines.forEach(l => p('  ' + l.trim()))
      }

      p('\n' + bar())
      p('  Git commands:')
      p(bar())
      p('    git add -A')
      p('    git diff --stat HEAD')
      p('    git commit -m "fix: remove duplicate route config exports"')
      p('    git push origin main\n')

      process.exit(0)
    }

    // Build failed
    const tail = output.split('\n').slice(-60).join('\n')
    p('\n  Build output (last 60 lines):')
    p(tail.split('\n').map(l => '  ' + l).join('\n'))

    if (isDuplicateErr) {
      // Try to fix the specific file mentioned, or re-scan all
      const errFile = parseDuplicateError(output)
      if (errFile) {
        p(`\n  Duplicate error in: ${errFile} — fixing...`)
        const fp = path.join(ROOT, errFile)
        if (fs.existsSync(fp)) {
          const src = fs.readFileSync(fp, 'utf8')
          const { content, changed } = deduplicateExports(src)
          if (changed) {
            fs.writeFileSync(fp, content, 'utf8')
            if (!allFixed.includes(errFile)) allFixed.push(errFile)
            p(`  ✅  Fixed: ${errFile}`)
            continue
          }
        }
      }
      // Fall back: re-scan everything
      p('  Re-scanning all routes...')
      const retry = scanAndFix()
      retry.forEach(f => { if (!allFixed.includes(f)) allFixed.push(f) })
      if (retry.length > 0) continue
    }

    // Non-duplicate error
    p('\n' + bar('═'))
    p('  ⚠️  BUILD FAILED — error is not a duplicate export issue')
    p(bar('═'))
    p(`\n  Files cleaned (${allFixed.length}):`)
    ;[...new Set(allFixed)].forEach(f => p(`    ${f}`))
    p('\n  Open build-output.log for the remaining error.')
    p('  Run: node finish-migration.js  if it is a type/import issue.\n')
    process.exit(1)
  }

  p('\n' + bar('═'))
  p(`  ⚠️  Build did not pass within ${RETRIES} attempts`)
  p(bar('═'))
  p(`\n  Files cleaned: ${[...new Set(allFixed)].length}`)
  ;[...new Set(allFixed)].forEach(f => p(`    ${f}`))
  p('\n  Open build-output.log for details.\n')
  process.exit(1)
}

main()
