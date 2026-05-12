#!/usr/bin/env node
// =============================================================================
// fix-supabase-types.js  —  v1.0
// =============================================================================
// Fully automated migration for Next.js 14 App Router CRM projects.
//
// What it does:
//   1. Reads src/lib/supabase.ts → extracts the real valid export list
//   2. Scans every .ts/.tsx in src/
//   3. For lines importing FROM @/lib/supabase (or relative paths):
//        Strips named imports that are NOT in the valid export list
//        Deletes the import line entirely if nothing valid remains
//   4. For ALL other lines in patched files:
//        Replaces `: RemovedType`    → `: any`
//        Replaces `: RemovedType[]`  → `: any[]`
//        Replaces `as RemovedType`   → `as any`
//        Replaces `as RemovedType[]` → `as any[]`
//        Replaces `<RemovedType>`    → `<any>`
//        Replaces `= RemovedType[]`  → `= any[]`  (type alias RHS)
//   5. Never touches non-supabase imports
//   6. Never modifies src/lib/supabase.ts itself
//   7. Collapses consecutive blank lines left by deleted imports
//   8. Runs npm run build after patching
//   9. If build fails with supabase-related errors → re-scans, retries (x3)
//  10. Stops and reports first non-supabase build error
//  11. Safe to run multiple times (idempotent)
//
// Run from project root: node fix-supabase-types.js
// Works on Windows, macOS, Linux.
// =============================================================================

'use strict'

const fs    = require('fs')
const path  = require('path')
const { spawnSync } = require('child_process')

// ─── Config ───────────────────────────────────────────────────────────────────

const ROOT          = process.cwd()
const SRC_DIR       = path.join(ROOT, 'src')
const SUPABASE_FILE = path.join(SRC_DIR, 'lib', 'supabase.ts')
const EXTENSIONS    = new Set(['.ts', '.tsx'])
const MAX_RETRIES   = 3

// ─── Step 1: Extract valid exports from src/lib/supabase.ts ──────────────────
//
// Text-scan only — no require(), no eval.
// Handles: export const/let/var, export function, export async function,
//          export type, export interface, export class, export enum,
//          export { name1, name2 as alias }

function extractValidExports(filePath) {
  const FALLBACK = new Set(['supabase', 'getSupabaseAdmin', 'getSupabaseBrowserClient',
                            'createServiceClient', 'getAdminClient'])

  if (!fs.existsSync(filePath)) {
    warn(`supabase.ts not found at ${rel(filePath)} — using fallback export list`)
    return FALLBACK
  }

  const src     = fs.readFileSync(filePath, 'utf8')
  const exports = new Set()

  const patterns = [
    /^export\s+(?:const|let|var)\s+(\w+)/gm,
    /^export\s+(?:async\s+)?function\s+(\w+)/gm,
    /^export\s+(?:type|interface|class|enum|abstract\s+class)\s+(\w+)/gm,
  ]
  for (const re of patterns)
    for (const m of src.matchAll(re))
      exports.add(m[1])

  // export { a, b as c }
  for (const m of src.matchAll(/^export\s+\{([^}]+)\}/gm))
    for (const entry of m[1].split(',')) {
      const parts = entry.trim().split(/\s+as\s+/)
      const name  = (parts[1] || parts[0]).trim()
      if (name) exports.add(name)
    }

  if (exports.size === 0) {
    warn('No exports parsed from supabase.ts — using fallback export list')
    return FALLBACK
  }

  return exports
}

// ─── Supabase import path detector ───────────────────────────────────────────
//
// Matches any import whose `from` string is:
//   '@/lib/supabase'
//   './supabase'
//   '../lib/supabase'
//   '../../lib/supabase'   (any depth)

const SUPABASE_FROM_RE = /from\s+['"](?:@\/lib\/supabase|(?:\.{1,2}\/)*(?:lib\/)?supabase)['"]/

function isSupabaseLine(line) {
  return SUPABASE_FROM_RE.test(line)
}

// ─── Step 3: Strip invalid named imports from one import line ─────────────────
//
// Returns:
//   null          → entire line should be deleted (no valid names left)
//   original line → nothing changed (all names valid, or not a named import)
//   new line      → some names stripped

function stripInvalidImports(line, validExports) {
  // Only handles single-line named imports: import [type] { ... } from '...'
  // Multi-line imports are flagged in the build output for manual fix.
  const RE = /^(\s*import\s+(?:type\s+)?)(\{[^}]+\})(\s+from\s+['"][^'"]+['"]\s*;?\s*)$/
  const m  = line.match(RE)
  if (!m) return line  // namespace import, default import, side-effect — leave alone

  const entries = m[2].slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)

  const kept = entries.filter(entry => {
    // Handle: 'Foo', 'Foo as Bar', 'type Foo', 'type Foo as Bar'
    const withoutType  = entry.replace(/^type\s+/, '')
    const sourceName   = withoutType.split(/\s+as\s+/)[0].trim()
    return validExports.has(sourceName)
  })

  if (kept.length === 0) return null
  if (kept.length === entries.length) return line  // nothing to strip

  return `${m[1]}{ ${kept.join(', ')} }${m[3]}`
}

// ─── Step 4: Build inline type replacer for removed names ─────────────────────
//
// For each removed type T, replaces:
//   : T[]     → : any[]
//   : T       → : any
//   <T>       → <any>
//   as T[]    → as any[]
//   as T      → as any
//   = T[]     → = any[]   (type alias RHS)
//   = T       → = any     (type alias RHS, non-function)
//
// Applies in a single pass per line. Idempotent.

function buildInlineReplacer(removedTypes) {
  // Pre-compile all regexes once
  const rules = removedTypes.map(T => {
    const e = T.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return [
      [new RegExp(`:\\s*${e}\\[\\]`, 'g'),            ': any[]'],
      [new RegExp(`:\\s*${e}\\b`,    'g'),             ': any'],
      [new RegExp(`<${e}>`,          'g'),             '<any>'],
      [new RegExp(`\\bas\\s+${e}\\[\\]`, 'g'),        'as any[]'],
      [new RegExp(`\\bas\\s+${e}\\b`,    'g'),        'as any'],
      [new RegExp(`=\\s*${e}\\[\\]`, 'g'),            '= any[]'],
      [new RegExp(`=\\s*${e}\\b(?!\\s*[({])`, 'g'),  '= any'],
    ]
  }).flat()

  return function replaceLine(line) {
    let r = line
    for (const [re, rep] of rules) r = r.replace(re, rep)
    return r
  }
}

// ─── Step 2 + 4 combined: transform one file ──────────────────────────────────

function transformFile(content, validExports, removedTypes) {
  const replaceInline = buildInlineReplacer(removedTypes)
  const lines  = content.split('\n')
  const out    = []
  let changed  = false
  const report = { importLines: [], inlineLines: [] }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (isSupabaseLine(line)) {
      const result = stripInvalidImports(line, validExports)

      if (result === null) {
        changed = true
        report.importLines.push({ line: i + 1, old: line.trim(), action: 'deleted' })
        continue  // line removed
      }
      if (result !== line) {
        changed = true
        report.importLines.push({ line: i + 1, old: line.trim(), new: result.trim(), action: 'stripped' })
      }
      out.push(result)

    } else {
      const result = replaceInline(line)
      if (result !== line) {
        changed = true
        report.inlineLines.push({ line: i + 1, old: line.trim(), new: result.trim() })
      }
      out.push(result)
    }
  }

  // Collapse 3+ consecutive blank lines → 2 (clean up gaps from deleted imports)
  const collapsed = []
  let blanks = 0
  for (const l of out) {
    if (l.trim() === '') { if (++blanks <= 2) collapsed.push(l) }
    else { blanks = 0; collapsed.push(l) }
  }

  return { newContent: collapsed.join('\n'), changed, report }
}

// ─── Walk src/ ────────────────────────────────────────────────────────────────

function walk(dir, results = []) {
  if (!fs.existsSync(dir)) return results
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!['node_modules', '.next', '.git', 'dist', 'out', '.turbo'].includes(entry.name))
        walk(full, results)
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      results.push(full)
    }
  }
  return results
}

// ─── Build ────────────────────────────────────────────────────────────────────

function runBuild() {
  log('\n  $ npm run build\n')

  const logFile = path.join(ROOT, 'build-output.log')

  // Write to file AND show live in terminal via inherit
  // shell:true + redirect is the only reliable capture method on Windows
  const cmd = `npm run build > "${logFile}" 2>&1`
  log(`  (saving build output to build-output.log)\n`)

  const result = spawnSync(cmd, [], {
    cwd:     ROOT,
    shell:   true,
    stdio:   'inherit',
    timeout: 8 * 60 * 1000,
  })

  let output = ''
  if (fs.existsSync(logFile)) {
    try { output = fs.readFileSync(logFile, 'utf8').trim() } catch (e) { output = '' }
  }

  if (!output || output.length < 10) {
    output = '[Build produced no captured output — scroll up in terminal to see the error]'
  }

  return { success: result.status === 0, output }
}

// Parse build output for supabase-related vs other errors
function analyzeErrors(output) {
  const lines = output.split('\n')

  // If we couldn't capture output at all, treat as unknown (don't auto-stop)
  const captureFailure = output.includes('[Script could not capture build output]') ||
                         output.includes('[Build capture error:')

  // Lines that look like TS/build errors
  const errorLines = lines.filter(l =>
    /(?:error TS\d+|Type error|Module not found|Cannot find name|has no exported member|does not provide an export named)/i.test(l)
  )

  const supabaseErrorLines = errorLines.filter(l =>
    /supabase/i.test(l)
  )

  // Extract unknown names from messages like:
  //   Module "@/lib/supabase" has no exported member 'Foo'
  //   does not provide an export named 'Foo'
  //   Cannot find name 'Foo'
  const unknownNames = new Set()
  const nameRe = /(?:has no exported member|does not provide an export named|Cannot find name)\s+'(\w+)'/g
  let m
  while ((m = nameRe.exec(output)) !== null) unknownNames.add(m[1])

  const firstNonSupabaseError = errorLines.find(l => !supabaseErrorLines.includes(l))

  return {
    totalErrors:           errorLines.length,
    hasSupabaseErrors:     supabaseErrorLines.length > 0,
    captureFailure,
    supabaseErrorLines,
    unknownNames,
    firstNonSupabaseError,
    tail: lines.slice(-100).join('\n'),
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rel(p)       { return path.relative(ROOT, p) }
function log(...a)    { console.log(...a) }
function warn(...a)   { console.log('  ⚠️ ', ...a) }
function hr(c = '─')  { return c.repeat(62) }

// ─── Scan + patch pass ────────────────────────────────────────────────────────

function runScanPass(validExports, removedTypes, allModified) {
  const files = walk(SRC_DIR)
  const modified = []

  for (const filePath of files) {
    // Never touch supabase.ts itself
    if (filePath === SUPABASE_FILE) continue

    let content
    try   { content = fs.readFileSync(filePath, 'utf8') }
    catch { warn(`Cannot read ${rel(filePath)}`); continue }

    // Quick check: does this file reference any removed type or import from supabase?
    const hasSupabaseRef = SUPABASE_FROM_RE.test(content)
    const hasRemovedType = removedTypes.some(t => content.includes(t))
    if (!hasSupabaseRef && !hasRemovedType) continue

    const { newContent, changed, report } = transformFile(content, validExports, removedTypes)

    if (!changed) continue

    // Skip if already in allModified (no double-reporting, but DO write if content changed)
    const wasAlreadyModified = allModified.includes(rel(filePath))

    try {
      fs.writeFileSync(filePath, newContent, 'utf8')
    } catch (e) {
      warn(`Cannot write ${rel(filePath)}: ${e.message}`)
      continue
    }

    if (!wasAlreadyModified) {
      modified.push({ file: rel(filePath), report })
    }
  }

  return modified
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  log('\n' + hr('═'))
  log('  fix-supabase-types.js — automated legacy type cleanup')
  log(hr('═') + '\n')

  if (!fs.existsSync(SRC_DIR)) {
    log('❌  src/ not found. Run this script from your project root.\n')
    process.exit(1)
  }

  // ── Read valid exports ────────────────────────────────────────────────────

  const validExports = extractValidExports(SUPABASE_FILE)
  log(`  Valid exports from supabase.ts (${validExports.size}):`)
  log(`    ${[...validExports].sort().join(', ')}\n`)

  // ── Determine removed types ───────────────────────────────────────────────
  //
  // These are the types that WERE commonly in supabase.ts but are now gone.
  // We build this list by scanning all files for names imported from supabase
  // that are NOT in validExports. This is better than a hardcoded list.

  log('  Scanning for invalid imports to determine removed type list...')
  const detectedRemovedTypes = new Set()

  for (const filePath of walk(SRC_DIR)) {
    if (filePath === SUPABASE_FILE) continue
    let content
    try { content = fs.readFileSync(filePath, 'utf8') } catch { continue }

    for (const line of content.split('\n')) {
      if (!isSupabaseLine(line)) continue

      const m = line.match(/\{([^}]+)\}/)
      if (!m) continue

      for (const entry of m[1].split(',')) {
        const withoutType  = entry.trim().replace(/^type\s+/, '')
        const sourceName   = withoutType.split(/\s+as\s+/)[0].trim()
        if (sourceName && !validExports.has(sourceName) && /^[A-Z]/.test(sourceName)) {
          detectedRemovedTypes.add(sourceName)
        }
      }
    }
  }

  if (detectedRemovedTypes.size > 0) {
    log(`\n  Detected removed types: ${[...detectedRemovedTypes].sort().join(', ')}`)
  } else {
    log('\n  No invalid imports detected in source files.')
  }

  const removedTypes = [...detectedRemovedTypes]

  // ── Initial scan ──────────────────────────────────────────────────────────

  log('\n' + hr() + '\n  Patching files...\n' + hr() + '\n')

  const allModified   = []   // rel paths, deduped
  const allReports    = []   // { file, report }

  const initial = runScanPass(validExports, removedTypes, allModified)
  for (const item of initial) {
    allModified.push(item.file)
    allReports.push(item)
    log(`  ✅  ${item.file}`)
    for (const r of item.report.importLines) {
      log(`       L${r.line} import ${r.action}: ${r.old.slice(0, 70)}`)
    }
    for (const r of item.report.inlineLines) {
      log(`       L${r.line}: ${r.old.slice(0, 40)} → ${r.new.slice(0, 40)}`)
    }
  }

  if (initial.length === 0) log('  (no files needed changes)\n')

  // ── Build loop ────────────────────────────────────────────────────────────

  let attempt = 0

  while (attempt < MAX_RETRIES) {
    attempt++
    log('\n' + hr())
    log(`  Build attempt ${attempt}/${MAX_RETRIES}`)
    log(hr())

    const { success, output } = runBuild()

    if (success) {
      // ── SUCCESS ────────────────────────────────────────────────────────────
      log('\n' + hr('═'))
      log('  ✅  BUILD PASSED')
      log(hr('═'))

      log(`\n  FILES MODIFIED (${allModified.length}):`)
      if (allModified.length === 0) {
        log('    none — project was already clean')
      } else {
        allModified.forEach(f => log(`    ${f}`))
      }

      log('\n  REPLACEMENTS MADE:')
      let totalImport = 0, totalInline = 0
      for (const { file, report } of allReports) {
        if (report.importLines.length + report.inlineLines.length === 0) continue
        log(`    ${file}`)
        for (const r of report.importLines) {
          log(`      [import] line ${r.line}: ${r.action}`)
          totalImport++
        }
        for (const r of report.inlineLines) {
          log(`      [inline] line ${r.line}: ${r.old.slice(0, 35).padEnd(36)} → ${r.new.slice(0, 35)}`)
          totalInline++
        }
      }
      if (totalImport === 0 && totalInline === 0) log('    (none)')

      log('\n  NEXT STEPS:')
      log('    git add -A')
      log('    git diff --stat HEAD')
      log('    git commit -m "fix: remove invalid legacy supabase type imports"')
      log('    git push origin main\n')

      process.exit(0)
    }

    // ── Build failed — analyze ─────────────────────────────────────────────

    const errors = analyzeErrors(output)

    log('\n  Build output (last 100 lines):')
    log(errors.tail.split('\n').map(l => '  ' + l).join('\n'))

    // If we couldn't capture output, tell user to run manually and stop
    if (errors.captureFailure) {
      log('\n' + hr('═'))
      log('  ⚠️  BUILD FAILED — could not capture output on this terminal')
      log(hr('═'))
      log('\n  The supabase import cleanup applied above is COMPLETE.')
      log('  To see the remaining build error, run manually:\n')
      log('      npm run build\n')
      log('  Then fix any remaining error and run this script again.\n')
      log(`  FILES MODIFIED (${allModified.length}):`)
      allModified.forEach(f => log(`    ${f}`))
      process.exit(1)
    }

    if (!errors.hasSupabaseErrors) {
      // Non-supabase failure — stop here
      log('\n' + hr('═'))
      log('  ⚠️  BUILD FAILED — error is NOT a supabase import issue')
      log(hr('═'))
      log(`\n  FILES MODIFIED (${allModified.length}):`)
      allModified.forEach(f => log(`    ${f}`))
      log('\n  REMAINING BLOCKER:')
      if (errors.firstNonSupabaseError) {
        log(`    ${errors.firstNonSupabaseError.trim()}`)
      }
      log('\n  The supabase import cleanup is complete.')
      log('  Fix the error above, then run: npm run build\n')
      process.exit(1)
    }

    // Supabase errors remain — add any newly discovered unknown names and re-scan
    let newRemovedCount = 0
    for (const name of errors.unknownNames) {
      if (!removedTypes.includes(name) && !validExports.has(name)) {
        removedTypes.push(name)
        newRemovedCount++
        log(`\n  → Adding newly discovered removed type: ${name}`)
      }
    }

    log(`\n  Re-scanning with ${removedTypes.length} known removed types...`)
    const retry = runScanPass(validExports, removedTypes, allModified)

    if (retry.length > 0) {
      for (const item of retry) {
        allModified.push(item.file)
        allReports.push(item)
        log(`  ✅  (retry) ${item.file}`)
      }
    } else if (newRemovedCount === 0) {
      // Nothing new found and no new type names — remaining errors may be
      // multi-line imports or something else. Break and report.
      log('\n  ⚠️  No additional files found to fix.')
      log('      Remaining errors may be in multi-line imports.')
      break
    }
  }

  // ── Final failure ──────────────────────────────────────────────────────────

  log('\n' + hr('═'))
  log('  ⚠️  BUILD STILL FAILING after all retry attempts')
  log(hr('═'))

  log(`\n  FILES MODIFIED (${allModified.length}):`)
  allModified.length ? allModified.forEach(f => log(`    ${f}`)) : log('    (none)')

  log(`\n  REMOVED TYPES PROCESSED: ${removedTypes.join(', ') || 'none'}`)

  log(`
  REMAINING BLOCKERS:
  ─────────────────────────────────────────────────────────
  Possible causes:

  1. Multi-line imports (this script handles single-line only):
     Find them with:
       grep -rn "from '@/lib/supabase'" src/ | grep -v "^[^:]*:import {"

  2. A type still referenced in code that wasn't in any import
     (e.g., a global.d.ts declaration or re-export from another file).
     Find with:
       grep -rn "\\b(${removedTypes.join('|')})\\b" src/ --include="*.ts" --include="*.tsx"

  3. The supabase.ts export list is incomplete.
     Open src/lib/supabase.ts and verify all needed types are exported.
  ─────────────────────────────────────────────────────────
  Valid exports currently in supabase.ts:
    ${[...validExports].sort().join(', ')}
  ─────────────────────────────────────────────────────────
`)

  process.exit(1)
}

main()
