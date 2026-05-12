#!/usr/bin/env node
// =============================================================================
// migrate-supabase-admin.js
// =============================================================================
// Migrates all `supabaseAdmin` usages to the factory pattern.
//
// What it does:
//   1. Scans every .ts/.tsx in src/ for any of these import patterns:
//        import { supabaseAdmin } from '@/lib/supabase'
//        import { supabaseAdmin } from '../lib/supabase'       (any relative depth)
//        import { supabaseAdmin } from './supabase'
//        import { ..., supabaseAdmin, ... } from '@/lib/supabase'  (multi-named)
//
//   2. For each file:
//      a. Rewrites the import → getSupabaseAdmin
//      b. Inserts `const supabaseAdmin = getSupabaseAdmin()` after imports
//         (only if not already present)
//      c. Leaves all query/logic code untouched
//
//   3. Also handles:
//      - supabaseAdmin destructured alongside other named imports
//      - Files that already have the fix (skip, no duplicate)
//      - Files using supabaseAdmin without importing it (flag as warning)
//
//   4. After patching, runs: npm run build
//      If build fails with import errors, fixes them and retries (up to 3x).
//
// Run from project root: node migrate-supabase-admin.js
// =============================================================================

const fs   = require('fs')
const path = require('path')
const { execSync, spawnSync } = require('child_process')

// ─── Config ──────────────────────────────────────────────────────────────────

const SRC_DIR    = path.join(process.cwd(), 'src')
const EXTENSIONS = ['.ts', '.tsx']

// All forms of the import we need to rewrite
const SUPABASE_LIB_PATTERN = /['"](?:@\/lib\/supabase|(?:\.{1,2}\/)+lib\/supabase|(?:\.\.\/)*supabase)['"]/

// The local-supabase shorthand used inside lib/ files
const LOCAL_SUPABASE_PATTERN = /['"]\.\/?supabase['"]/

// Detects that a file already has the const assignment
const ALREADY_MIGRATED_RE = /const\s+supabaseAdmin\s*=\s*getSupabaseAdmin\(\)/

// Detects old direct-export usage (module-level singleton, the thing we removed)
const OLD_EXPORT_RE = /export\s+const\s+supabaseAdmin\s*=/

// ─── Helpers ─────────────────────────────────────────────────────────────────

function walk(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!['node_modules', '.next', '.git', 'dist'].includes(entry.name)) {
        walk(full, results)
      }
    } else if (EXTENSIONS.includes(path.extname(entry.name))) {
      results.push(full)
    }
  }
  return results
}

function relPath(p) {
  return path.relative(process.cwd(), p)
}

// ─── Core transform ───────────────────────────────────────────────────────────
//
// Given file content, return { newContent, changed, skipped, reason }
//
// Import lines we handle:
//
//   CASE A — supabaseAdmin is the only named import:
//     import { supabaseAdmin } from '@/lib/supabase'
//     → import { getSupabaseAdmin } from '@/lib/supabase'
//
//   CASE B — supabaseAdmin is one of many named imports:
//     import { supabase, supabaseAdmin, Foo } from '@/lib/supabase'
//     → import { supabase, getSupabaseAdmin, Foo } from '@/lib/supabase'
//
//   CASE C — supabaseAdmin is aliased:
//     import { supabaseAdmin as admin } from '@/lib/supabase'
//     → import { getSupabaseAdmin } from '@/lib/supabase'
//     + const supabaseAdmin = getSupabaseAdmin()   ← alias preserved via const name

function transform(content, filePath) {
  // Skip the supabase lib file itself
  if (filePath.endsWith('lib/supabase.ts') || filePath.endsWith('lib/supabase.tsx')) {
    return { newContent: content, changed: false, skipped: true, reason: 'is supabase.ts itself' }
  }

  // Already fully migrated?
  if (ALREADY_MIGRATED_RE.test(content)) {
    const hasOldImport = /import\s+\{[^}]*supabaseAdmin[^}]*\}\s+from/.test(content)
    if (!hasOldImport) {
      return { newContent: content, changed: false, skipped: true, reason: 'already migrated' }
    }
    // Has const assignment but import wasn't updated yet — fall through to fix import
  }

  // Does this file even reference supabaseAdmin?
  if (!content.includes('supabaseAdmin')) {
    return { newContent: content, changed: false, skipped: true, reason: 'no supabaseAdmin reference' }
  }

  const lines = content.split('\n')
  let importLineIndex   = -1   // line index of the import to rewrite
  let hasOldImport      = false
  let importRewritten   = false
  let otherImports      = []   // other named imports from same line (preserved)

  // ── Step 1: find the import line ──────────────────────────────────────────

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Must be an import statement referencing supabase lib
    if (!line.trimStart().startsWith('import')) continue
    if (!line.includes('supabaseAdmin')) continue

    // Must be from a supabase lib path
    const isSupabasePath =
      SUPABASE_LIB_PATTERN.test(line) || LOCAL_SUPABASE_PATTERN.test(line)
    if (!isSupabasePath) continue

    importLineIndex = i
    hasOldImport = true

    // Extract the full imports list between { }
    const braceMatch = line.match(/\{([^}]+)\}/)
    if (!braceMatch) continue

    const allImports = braceMatch[1]
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)

    // Separate supabaseAdmin from everything else
    const others = allImports.filter(imp => {
      // handles: supabaseAdmin, supabaseAdmin as admin
      return !imp.match(/^supabaseAdmin(\s+as\s+\w+)?$/)
    })
    otherImports = others

    // Build replacement import line
    const allNew = [...others, 'getSupabaseAdmin']
    const newImport = line.replace(
      /\{[^}]+\}/,
      `{ ${allNew.join(', ')} }`
    )
    lines[i] = newImport
    importRewritten = true
    break
  }

  if (!hasOldImport) {
    // supabaseAdmin is used in code but never imported from supabase lib
    // Could be a param, local var, etc. — do NOT modify.
    return { newContent: content, changed: false, skipped: true, reason: 'supabaseAdmin not imported from @/lib/supabase' }
  }

  if (!importRewritten) {
    return { newContent: content, changed: false, skipped: true, reason: 'import line found but could not rewrite' }
  }

  // ── Step 2: insert `const supabaseAdmin = getSupabaseAdmin()` ─────────────
  // Skip if already present (guard against double-run)

  if (!ALREADY_MIGRATED_RE.test(lines.join('\n'))) {
    // Insert right after the last import line
    let lastImport = importLineIndex
    for (let i = importLineIndex + 1; i < lines.length; i++) {
      const t = lines[i].trim()
      if (t.startsWith('import ') || t.startsWith('import{') || t.startsWith('import type')) {
        lastImport = i
      } else if (t === '' || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) {
        // blank / comment — keep scanning
      } else {
        break // hit real code
      }
    }

    lines.splice(lastImport + 1, 0, '', 'const supabaseAdmin = getSupabaseAdmin()')
  }

  return { newContent: lines.join('\n'), changed: true, skipped: false, reason: null }
}

// ─── Build runner ─────────────────────────────────────────────────────────────

function runBuild() {
  console.log('\n' + '─'.repeat(60))
  console.log('  Running: npm run build')
  console.log('─'.repeat(60))

  const result = spawnSync('npm', ['run', 'build'], {
    cwd: process.cwd(),
    stdio: 'pipe',
    encoding: 'utf8',
    timeout: 5 * 60 * 1000,  // 5 min timeout
  })

  const stdout = result.stdout || ''
  const stderr = result.stderr || ''
  const combined = stdout + stderr

  const success = result.status === 0
  return { success, stdout, stderr, combined }
}

// Parses build output for "Module not found" or "does not provide an export named"
// Returns array of { file, missingExport } objects
function parseImportErrors(buildOutput) {
  const errors = []

  // Pattern 1: "Export 'X' doesn't exist in target module"
  // Pattern 2: "does not provide an export named 'X'"
  // Pattern 3: "Module ... has no exported member 'X'"
  const exportErrorRe = /(?:Export '(\w+)' doesn't exist|does not provide an export named '(\w+)'|has no exported member '(\w+)')/g
  let m
  while ((m = exportErrorRe.exec(buildOutput)) !== null) {
    const name = m[1] || m[2] || m[3]
    if (name) errors.push({ type: 'missing_export', name })
  }

  // Pattern 4: file path + error
  const fileErrorRe = /(?:error TS\d+|Type error).*?(?:\.\/|src\/)([^\s:]+\.tsx?)/g
  while ((m = fileErrorRe.exec(buildOutput)) !== null) {
    errors.push({ type: 'file_error', file: m[1] })
  }

  return errors
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log('\n' + '═'.repeat(60))
  console.log('  supabaseAdmin → getSupabaseAdmin() migration')
  console.log('═'.repeat(60) + '\n')

  if (!fs.existsSync(SRC_DIR)) {
    console.error('❌  src/ directory not found. Run from project root.\n')
    process.exit(1)
  }

  const allFiles = walk(SRC_DIR)
  console.log(`  Scanning ${allFiles.length} TypeScript files in src/\n`)

  const report = {
    modified: [],
    skipped:  [],
    errors:   [],
  }

  // ── Phase 1: apply transforms ──────────────────────────────────────────────

  for (const filePath of allFiles) {
    const rel = relPath(filePath)
    let content
    try {
      content = fs.readFileSync(filePath, 'utf8')
    } catch (e) {
      report.errors.push({ file: rel, error: `read error: ${e.message}` })
      continue
    }

    const { newContent, changed, skipped, reason } = transform(content, filePath)

    if (changed) {
      try {
        fs.writeFileSync(filePath, newContent, 'utf8')
        report.modified.push(rel)
        console.log(`  ✅  ${rel}`)
      } catch (e) {
        report.errors.push({ file: rel, error: `write error: ${e.message}` })
      }
    } else {
      report.skipped.push({ file: rel, reason })
    }
  }

  // ── Phase 1 report ────────────────────────────────────────────────────────

  console.log('\n' + '─'.repeat(60))
  console.log(`  Modified: ${report.modified.length}  |  Skipped: ${report.skipped.length}  |  Errors: ${report.errors.length}`)

  if (report.errors.length > 0) {
    console.log('\n  ❌ File errors:')
    report.errors.forEach(e => console.log(`     ${e.file}: ${e.error}`))
  }

  const skippedWithMissing = report.skipped.filter(s =>
    s.reason !== 'already migrated' &&
    s.reason !== 'no supabaseAdmin reference' &&
    s.reason !== 'is supabase.ts itself'
  )
  if (skippedWithMissing.length > 0) {
    console.log('\n  ⚠️  Skipped (may need manual review):')
    skippedWithMissing.forEach(s => console.log(`     ${s.file}  (${s.reason})`))
  }

  if (report.modified.length === 0 && report.errors.length === 0) {
    console.log('\n  ✅ Nothing to migrate — all files already use getSupabaseAdmin()')
  }

  // ── Phase 2: build ────────────────────────────────────────────────────────

  let buildAttempt = 0
  const MAX_BUILD_ATTEMPTS = 3

  while (buildAttempt < MAX_BUILD_ATTEMPTS) {
    buildAttempt++
    console.log(`\n  Build attempt ${buildAttempt}/${MAX_BUILD_ATTEMPTS}`)

    const { success, combined } = runBuild()

    if (success) {
      console.log('\n' + '═'.repeat(60))
      console.log('  ✅  BUILD SUCCEEDED')
      console.log('═'.repeat(60))

      console.log('\n  FILES MODIFIED:')
      if (report.modified.length === 0) {
        console.log('    (none — all files were already migrated)')
      } else {
        report.modified.forEach(f => console.log(`    ${f}`))
      }

      console.log('\n  NEXT STEPS:')
      console.log('    git add -A')
      console.log('    git diff --stat HEAD   # verify only expected files changed')
      console.log('    git commit -m "refactor: migrate supabaseAdmin to getSupabaseAdmin factory"')
      console.log('    git push origin main\n')
      process.exit(0)
    }

    // Build failed — try to auto-fix
    console.log('\n  ❌ Build failed. Analyzing errors...')

    const importErrors = parseImportErrors(combined)

    // Print the last 80 lines of build output for visibility
    const outputLines = combined.trim().split('\n')
    const tail = outputLines.slice(-60).join('\n')
    console.log('\n  --- BUILD OUTPUT (last 60 lines) ---')
    console.log(tail)
    console.log('  --- END BUILD OUTPUT ---\n')

    if (importErrors.length === 0) {
      console.log('\n  ⚠️  Build failed but no auto-fixable import errors detected.')
      console.log('     See build output above for details.\n')
      break
    }

    // Check for "supabaseAdmin is not exported" type errors
    const supabaseAdminError = importErrors.find(e => e.name === 'supabaseAdmin')
    if (supabaseAdminError) {
      console.log('  → Found remaining supabaseAdmin import error. Re-running scan...')
      // Re-scan and fix any files that were missed
      let fixedAdditional = 0
      for (const filePath of walk(SRC_DIR)) {
        const rel = relPath(filePath)
        if (report.modified.includes(rel)) continue
        let content
        try { content = fs.readFileSync(filePath, 'utf8') } catch { continue }
        const { newContent, changed } = transform(content, filePath)
        if (changed) {
          fs.writeFileSync(filePath, newContent, 'utf8')
          report.modified.push(rel)
          console.log(`  ✅  (retry) ${rel}`)
          fixedAdditional++
        }
      }
      if (fixedAdditional === 0) {
        console.log('  ⚠️  No additional files to fix. Build error may be in supabase.ts itself.')
        break
      }
      continue  // retry build
    }

    // No more auto-fixable errors
    break
  }

  // ── Final failure report ──────────────────────────────────────────────────

  console.log('\n' + '═'.repeat(60))
  console.log('  ⚠️  BUILD RESULT: FAILED (see output above)')
  console.log('═'.repeat(60))

  console.log('\n  FILES MODIFIED DURING THIS RUN:')
  if (report.modified.length === 0) {
    console.log('    (none)')
  } else {
    report.modified.forEach(f => console.log(`    ${f}`))
  }

  console.log('\n  REMAINING BLOCKERS:')
  console.log('    The build failed for reasons beyond supabaseAdmin import fixes.')
  console.log('    Common causes:')
  console.log('    1. TypeScript type errors unrelated to this migration')
  console.log('    2. A missing export in src/lib/supabase.ts itself')
  console.log('    3. An import from a non-existent file')
  console.log('')
  console.log('    Check build output above. The first error line tells you exactly')
  console.log('    which file and line number to fix.\n')

  process.exit(1)
}

main()
