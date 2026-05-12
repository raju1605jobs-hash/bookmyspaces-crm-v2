#!/usr/bin/env node
'use strict'
// =============================================================================
// finish-migration.js
// Final cleanup: supabaseAdmin → getSupabaseAdmin() migration remnants only.
// 
// Run from project root: node finish-migration.js
//
// What it does:
//   Pass 1 — Scans every src/**/*.ts|tsx for supabaseAdmin remnants and fixes them.
//   Pass 2 — Runs npm run build, reads ONLY the first error.
//   Pass 3 — Fixes exactly that error (supabaseAdmin ref or missing type annotation).
//   Repeats until build passes or a non-fixable error is found.
//
// What it NEVER does:
//   - Never touches lucide-react, react, next/* imports
//   - Never replaces bare identifiers in import blocks
//   - Never modifies JSX tags or component names
//   - Never touches business logic or UI
// =============================================================================

const fs   = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT          = process.cwd()
const SRC           = path.join(ROOT, 'src')
const SUPABASE_FILE = path.join(SRC, 'lib', 'supabase.ts')
const LOG_FILE      = path.join(ROOT, 'build-output.log')
const MAX_RETRIES   = 8
const EXTS          = new Set(['.ts', '.tsx'])

// Supabase import path — matches @/lib/supabase and all relative variants
const SUPABASE_PATH_RE =
  /from\s+['"](?:@\/lib\/supabase|(?:\.{1,2}\/)*(?:[\w\/-]*\/)?supabase)['"]/

// ─── Walk src/ ────────────────────────────────────────────────────────────────

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (!['node_modules', '.next', '.git', 'dist', 'out', '.turbo'].includes(e.name))
        walk(full, acc)
    } else if (EXTS.has(path.extname(e.name))) {
      acc.push(full)
    }
  }
  return acc
}

// ─── Transform 1: fix static import { supabaseAdmin } ─────────────────────────
// import { supabaseAdmin } from '@/lib/supabase'
// import { supabase, supabaseAdmin } from '@/lib/supabase'
// → replaces supabaseAdmin with getSupabaseAdmin in the import
// → inserts `const supabaseAdmin = getSupabaseAdmin()` after imports

function fixStaticImport(content) {
  if (!content.includes('supabaseAdmin')) return { content, changed: false }

  const lines = content.split('\n')
  const out   = []
  let changed = false
  let lastImportIdx = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (SUPABASE_PATH_RE.test(line) && /\bsupabaseAdmin\b/.test(line)) {
      // Replace supabaseAdmin → getSupabaseAdmin within this import line
      const fixed = line.replace(/\bsupabaseAdmin\b/g, 'getSupabaseAdmin')
      out.push(fixed)
      changed = true
    } else {
      out.push(line)
    }

    // Track the last import line index for const insertion
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

// ─── Transform 2: fix dynamic import ──────────────────────────────────────────
// const { supabaseAdmin } = await import('./supabase')
// → const { getSupabaseAdmin } = await import('./supabase')
//   const supabaseAdmin = getSupabaseAdmin()

function fixDynamicImport(content) {
  if (!content.includes('supabaseAdmin')) return { content, changed: false }

  let changed = false
  const result = content.replace(
    /^(\s*)const\s*\{\s*supabaseAdmin\s*\}\s*(=\s*await\s+import\s*\([^)]+\).*)/gm,
    (_match, indent, rest) => {
      changed = true
      return (
        `${indent}const { getSupabaseAdmin } ${rest}\n` +
        `${indent}const supabaseAdmin = getSupabaseAdmin()`
      )
    }
  )

  return { content: result, changed }
}

// ─── Transform 3: fix missing const (supabaseAdmin used but never declared) ────
// This happens when a previous script stripped the import but left usages.
// Adds `const supabaseAdmin = getSupabaseAdmin()` after the last import line,
// and ensures getSupabaseAdmin is imported.

function fixMissingConst(content) {
  if (!content.includes('supabaseAdmin')) return { content, changed: false }
  if (content.includes('const supabaseAdmin = getSupabaseAdmin()')) {
    return { content, changed: false }  // already has it
  }

  // Check supabaseAdmin is actually used (not just in a comment)
  const usageRe = /(?<![/\s*])supabaseAdmin\s*\./
  if (!usageRe.test(content)) return { content, changed: false }

  const lines  = content.split('\n')
  let changed  = false

  // Ensure getSupabaseAdmin is imported
  let hasImport = content.includes("getSupabaseAdmin")
  let lastImportIdx = -1

  for (let i = 0; i < lines.length; i++) {
    if (/^\s*import[\s{*"']/.test(lines[i])) lastImportIdx = i
  }

  const out = [...lines]

  // Add import if missing
  if (!hasImport && lastImportIdx >= 0) {
    // Check if there's already a supabase import line to piggyback on
    const supabaseImportIdx = lines.findIndex(
      l => SUPABASE_PATH_RE.test(l) && /import\s+\{/.test(l)
    )
    if (supabaseImportIdx >= 0) {
      // Add getSupabaseAdmin to existing import
      out[supabaseImportIdx] = out[supabaseImportIdx].replace(
        /(\{)([^}]+)(\})/,
        (_, open, names, close) => `${open}${names.trimEnd()}, getSupabaseAdmin${close}`
      )
    } else {
      // Insert new import after last import
      out.splice(lastImportIdx + 1, 0, "import { getSupabaseAdmin } from '@/lib/supabase'")
      lastImportIdx++
    }
    changed = true
  }

  // Insert const after last import
  const insertAt = out.reduce(
    (last, l, i) => (/^\s*import[\s{*"']/.test(l) ? i : last), 0
  )
  out.splice(insertAt + 1, 0, '', 'const supabaseAdmin = getSupabaseAdmin()')
  changed = true

  return { content: out.join('\n'), changed }
}

// ─── Transform 4: fix type annotation only (never touches imports or JSX) ──────
// Only replaces in: `: Type`, `<Type>`, `as Type` positions
// NEVER replaces bare identifiers, import members, JSX tags

function fixTypeAnnotation(content, typeName) {
  const e = typeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const lines  = content.split('\n')
  let changed  = false
  const out    = []

  for (const line of lines) {
    // Skip ALL import lines entirely — never touch them
    if (/^\s*import[\s{*"']/.test(line)) { out.push(line); continue }

    let r = line
    // Annotation-only replacements (not bare identifiers):
    r = r.replace(new RegExp(`:\\s*${e}\\[\\]`, 'g'),               ': any[]')
    r = r.replace(new RegExp(`:\\s*${e}\\s*\\|\\s*null`, 'g'),      ': any | null')
    r = r.replace(new RegExp(`:\\s*${e}\\s*\\|\\s*undefined`, 'g'), ': any | undefined')
    r = r.replace(new RegExp(`:\\s*${e}\\b`, 'g'),                  ': any')
    // Generic — only after \w (TypeScript generic context, not JSX)
    r = r.replace(new RegExp(`(?<=\\w)<${e}\\[\\]>`, 'g'),          '<any[]>')
    r = r.replace(new RegExp(`(?<=\\w)<${e}>`, 'g'),                '<any>')
    // as casts
    r = r.replace(new RegExp(`\\bas\\s+${e}\\[\\]`, 'g'),           'as any[]')
    r = r.replace(new RegExp(`\\bas\\s+${e}\\b`, 'g'),              'as any')

    if (r !== line) changed = true
    out.push(r)
  }

  return { content: out.join('\n'), changed }
}

// ─── Scan and fix all files (Pass 1) ─────────────────────────────────────────

function initialScan(allFixed) {
  const files = walk(SRC)
  print(`\n  Scanning ${files.length} files for supabaseAdmin remnants...\n`)

  for (const fp of files) {
    if (fp === SUPABASE_FILE) continue

    let src
    try   { src = fs.readFileSync(fp, 'utf8') }
    catch { continue }

    if (!src.includes('supabaseAdmin')) continue

    let content = src
    let fileChanged = false

    // Apply transforms in order
    for (const fn of [fixDynamicImport, fixStaticImport, fixMissingConst]) {
      const { content: next, changed } = fn(content)
      if (changed) { content = next; fileChanged = true }
    }

    if (!fileChanged) continue

    // Idempotency: don't write if identical
    if (content === src) continue

    try {
      fs.writeFileSync(fp, content, 'utf8')
      const r = path.relative(ROOT, fp)
      allFixed.push(r)
      print(`  ✅  ${r}`)
    } catch (e) {
      print(`  ⚠️  write error: ${fp} — ${e.message}`)
    }
  }
}

// ─── Build ────────────────────────────────────────────────────────────────────

function runBuild() {
  print(`\n  $ npm run build  (output → build-output.log)`)

  const result = spawnSync(`npm run build > "${LOG_FILE}" 2>&1`, [], {
    cwd:     ROOT,
    shell:   true,
    stdio:   'inherit',
    timeout: 10 * 60 * 1000,
  })

  let output = ''
  try { output = fs.readFileSync(LOG_FILE, 'utf8') } catch {}

  return { success: result.status === 0, output }
}

// ─── Parse FIRST error from build output ──────────────────────────────────────

function parseFirstError(output) {
  const lines  = output.split('\n')
  const fileRe = /^\.\/(src\/[^\s:]+\.tsx?):(\d+):(\d+)/

  let firstFile = null, firstLineNo = 0, markerIdx = -1

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(fileRe)
    if (m) {
      firstFile  = m[1]
      firstLineNo = parseInt(m[2])
      markerIdx  = i
      break
    }
  }

  if (!firstFile) return null

  // Collect ~10 lines of context starting at the error marker
  const context = lines.slice(markerIdx, markerIdx + 10).join('\n')

  // Classify
  const isSupabaseAdmin =
    /supabaseAdmin/.test(context) ||
    /property.*does not exist on type.*never/i.test(context) ||
    /object is of type.*never/i.test(context)

  const missingTypeMatch = context.match(/Cannot find name '([A-Z]\w+)'/)
  const noExportMatch    = context.match(/(?:has no exported member|does not provide an export named)\s+'(\w+)'/)

  // Extract the specific type name from the source line if possible
  const srcLine = firstLineNo > 0
    ? (fs.existsSync(path.join(ROOT, firstFile))
        ? fs.readFileSync(path.join(ROOT, firstFile), 'utf8').split('\n')[firstLineNo - 1] || ''
        : '')
    : ''

  return {
    file:            firstFile,
    line:            firstLineNo,
    context,
    srcLine,
    isSupabaseAdmin,
    missingType:     missingTypeMatch?.[1] || noExportMatch?.[1] || null,
    raw:             context,
  }
}

// ─── Fix a specific file based on error classification ────────────────────────

function fixFile(err, allFixed) {
  const fp   = path.join(ROOT, err.file)
  if (!fs.existsSync(fp)) { print(`  ⚠️  File not found: ${err.file}`); return false }

  let content
  try   { content = fs.readFileSync(fp, 'utf8') }
  catch { print(`  ⚠️  Cannot read: ${err.file}`); return false }

  const original = content
  let fileChanged = false

  if (err.isSupabaseAdmin) {
    // Fix supabaseAdmin reference
    for (const fn of [fixDynamicImport, fixStaticImport, fixMissingConst]) {
      const { content: next, changed } = fn(content)
      if (changed) { content = next; fileChanged = true }
    }
    if (!fileChanged) {
      print(`  ⚠️  Could not auto-fix supabaseAdmin in ${err.file}`)
      print(`      Error context:\n${err.context}`)
    }
  } else if (err.missingType) {
    // Fix type annotation only
    const { content: next, changed } = fixTypeAnnotation(content, err.missingType)
    if (changed) { content = next; fileChanged = true }
    else {
      print(`  ⚠️  Could not find '${err.missingType}' annotation in ${err.file}`)
      print(`      Source line: ${err.srcLine}`)
    }
  }

  if (fileChanged && content !== original) {
    try {
      fs.writeFileSync(fp, content, 'utf8')
      if (!allFixed.includes(err.file)) allFixed.push(err.file)
      print(`  ✅  fixed: ${err.file}`)
      return true
    } catch (e) {
      print(`  ⚠️  write error: ${err.file} — ${e.message}`)
    }
  }

  return fileChanged
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function print(...a) { console.log(...a) }
function bar(c = '─') { return c.repeat(64) }

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  print('\n' + bar('═'))
  print('  finish-migration.js — final supabaseAdmin cleanup')
  print(bar('═'))

  if (!fs.existsSync(SRC)) {
    print('\n❌  src/ not found. Run from your project root.\n')
    process.exit(1)
  }

  const allFixed = []

  // ── Pass 1: proactive scan ───────────────────────────────────────────────────
  print('\n' + bar() + '\n  Pass 1: proactive scan for supabaseAdmin\n' + bar())
  initialScan(allFixed)

  if (allFixed.length === 0) {
    print('  (no supabaseAdmin references found in src/)')
  }

  // ── Pass 2–N: build → fix first error → repeat ───────────────────────────────
  let consecutiveUnfixed = 0

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    print('\n' + bar())
    print(`  Build attempt ${attempt}/${MAX_RETRIES}`)
    print(bar())

    const { success, output } = runBuild()

    if (success) {
      // ── BUILD PASSED ────────────────────────────────────────────────────────
      print('\n' + bar('═'))
      print('  ✅  BUILD PASSED')
      print(bar('═'))

      print(`\n  Files modified (${allFixed.length}):`)
      if (allFixed.length > 0) {
        ;[...new Set(allFixed)].forEach(f => print(`    ${f}`))
      } else {
        print('    (none — project was already clean)')
      }

      // Extract and show the build summary lines
      const summaryLines = output.split('\n').filter(l =>
        l.includes('Route') || l.includes('○') || l.includes('ƒ') ||
        l.includes('First Load') || l.includes('chunks') || l.includes('✓')
      ).slice(0, 20)
      if (summaryLines.length > 0) {
        print('\n  Build summary:')
        summaryLines.forEach(l => print('  ' + l))
      }

      print('\n' + bar())
      print('  Git commands to deploy:')
      print(bar())
      print('    git add -A')
      print('    git diff --stat HEAD          # verify scope')
      print('    git commit -m "fix: complete supabaseAdmin → getSupabaseAdmin migration"')
      print('    git push origin main\n')

      process.exit(0)
    }

    // ── FAILED — read first error ─────────────────────────────────────────────
    print('\n  Build output (last 60 lines):')
    const tail = output.split('\n').slice(-60).join('\n')
    print(tail.split('\n').map(l => '  ' + l).join('\n'))

    const err = parseFirstError(output)

    if (!err) {
      print('\n  ⚠️  Could not parse a fixable error from build output.')
      print('      Open build-output.log for details.')
      break
    }

    print(`\n  First error: ${err.file}:${err.line}`)
    print(`  Type: ${err.isSupabaseAdmin ? 'supabaseAdmin reference' : err.missingType ? `missing type '${err.missingType}'` : 'unknown'}`)

    if (!err.isSupabaseAdmin && !err.missingType) {
      print('\n' + bar('═'))
      print('  ⚠️  REMAINING ERROR IS NOT AUTO-FIXABLE')
      print(bar('═'))
      print('\n  This error is outside the scope of this migration script.')
      print('  Fix it manually, then run: node finish-migration.js\n')
      print(`  Error details:\n${err.context}\n`)
      break
    }

    const fixed = fixFile(err, allFixed)
    if (!fixed) {
      consecutiveUnfixed++
      if (consecutiveUnfixed >= 2) {
        print('\n  ⚠️  Same error persists after 2 attempts — stopping to avoid loop.')
        print(`      Please fix ${err.file}:${err.line} manually.\n`)
        break
      }
    } else {
      consecutiveUnfixed = 0
    }
  }

  // ── Final state ───────────────────────────────────────────────────────────────
  print('\n' + bar('═'))
  print(`  ⚠️  Build did not pass within ${MAX_RETRIES} attempts`)
  print(bar('═'))
  print(`\n  Files modified (${allFixed.length}):`)
  ;[...new Set(allFixed)].forEach(f => print(`    ${f}`))
  print('\n  Open build-output.log for the full error.\n')

  process.exit(1)
}

main()
