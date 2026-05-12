#!/usr/bin/env node
// =============================================================================
// clean-supabase-imports.js
// =============================================================================
// Strips all invalid named imports from @/lib/supabase (and relative paths).
//
// STEP 1: Reads src/lib/supabase.ts to extract the real valid export list.
//         Falls back to a known-good set if the file can't be parsed.
//
// STEP 2: Scans every .ts/.tsx in src/.
//         For each line that imports from @/lib/supabase (or relative):
//           - Keeps only names that exist in the real export list
//           - Deletes the line entirely if nothing valid remains
//           - Leaves non-supabase imports completely untouched
//
// STEP 3: Runs npm run build.
//         If it fails with supabase-related import errors → re-scans, retries.
//         Stops when build passes OR a non-supabase error is found.
//
// Run from project root: node clean-supabase-imports.js
// =============================================================================

'use strict'

const fs      = require('fs')
const path    = require('path')
const { spawnSync } = require('child_process')

// ── Paths ─────────────────────────────────────────────────────────────────────

const PROJECT_ROOT  = process.cwd()
const SRC_DIR       = path.join(PROJECT_ROOT, 'src')
const SUPABASE_FILE = path.join(SRC_DIR, 'lib', 'supabase.ts')

// ── Step 1: Extract valid exports from src/lib/supabase.ts ───────────────────
//
// Strategy: parse the file with a regex that matches all `export` declarations.
// We do NOT eval or require() it — just text scanning.
//
// Patterns we match:
//   export const foo           → 'foo'
//   export function foo(       → 'foo'
//   export type Foo            → 'Foo'  (export type alias)
//   export interface Foo       → 'Foo'
//   export class Foo           → 'Foo'
//   export { foo, bar }        → 'foo', 'bar'
//   export default             → ignored (default exports don't appear in named imports)

const FALLBACK_VALID_EXPORTS = new Set([
  'supabase',
  'getSupabaseAdmin',
  'getSupabaseBrowserClient',
  'createServiceClient',
  'getAdminClient',
])

function extractValidExports(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️  src/lib/supabase.ts not found at ${filePath}`)
    console.log(`      Using fallback export list: ${[...FALLBACK_VALID_EXPORTS].join(', ')}`)
    return FALLBACK_VALID_EXPORTS
  }

  const content = fs.readFileSync(filePath, 'utf8')
  const exports = new Set()

  // export const / let / var name
  for (const m of content.matchAll(/^export\s+(?:const|let|var)\s+(\w+)/gm)) {
    exports.add(m[1])
  }
  // export function name / export async function name
  for (const m of content.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)) {
    exports.add(m[1])
  }
  // export type Name / export interface Name / export class Name / export enum Name
  for (const m of content.matchAll(/^export\s+(?:type\s+|interface\s+|class\s+|enum\s+|abstract\s+class\s+)(\w+)/gm)) {
    exports.add(m[1])
  }
  // export { name1, name2 as alias2, ... }
  for (const m of content.matchAll(/^export\s+\{([^}]+)\}/gm)) {
    for (const entry of m[1].split(',')) {
      const parts = entry.trim().split(/\s+as\s+/)
      // 'name as alias' → the external name is the alias
      const externalName = (parts[1] || parts[0]).trim()
      if (externalName) exports.add(externalName)
    }
  }

  if (exports.size === 0) {
    console.log(`  ⚠️  Could not parse any exports from supabase.ts. Using fallback.`)
    return FALLBACK_VALID_EXPORTS
  }

  return exports
}

// ── Step 2: File transform ────────────────────────────────────────────────────

// Matches any import line that pulls from a supabase path:
//   @/lib/supabase
//   ./supabase
//   ../lib/supabase
//   ../../lib/supabase  (any depth)
const SUPABASE_PATH_RE = /from\s+['"](?:@\/lib\/supabase|(?:\.{1,2}\/)*(?:lib\/)?supabase)['"]/

function isSupabaseLine(line) {
  return SUPABASE_PATH_RE.test(line)
}

// Given a single import line from a supabase module, strip invalid names.
// Returns:
//   null            → delete the line entirely
//   original line   → nothing to strip (already clean)
//   modified line   → some names were removed
function stripInvalidNames(line, validExports) {
  // Only handle named imports: import [type] { ... } from '...'
  // Multi-line imports are NOT supported here — they're rare and the
  // build error output will tell you if one exists.
  const RE = /^(\s*import\s+(?:type\s+)?)(\{[^}]+\})(\s+from\s+['"][^'"]+['"]\s*;?\s*)$/
  const m = line.match(RE)

  if (!m) {
    // Not a named import (default import, namespace import, side-effect import)
    // Leave untouched — those don't name individual exports
    return line
  }

  const prefix    = m[1]  // 'import ' or 'import type '
  const braces    = m[2]  // '{ foo, bar as baz }'
  const suffix    = m[3]  // ' from "@/lib/supabase"'

  const rawEntries = braces.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)

  const kept = rawEntries.filter(entry => {
    // Entry formats: 'foo', 'foo as bar', 'type foo', 'type foo as bar'
    // The name to look up is the SOURCE name (before 'as')
    const withoutTypeKeyword = entry.replace(/^type\s+/, '')
    const sourceName = withoutTypeKeyword.split(/\s+as\s+/)[0].trim()
    return validExports.has(sourceName)
  })

  if (kept.length === 0) return null  // entire import line is invalid
  if (kept.length === rawEntries.length) return line  // nothing to strip

  return `${prefix}{ ${kept.join(', ')} }${suffix}`
}

function transformFile(content, validExports) {
  const lines  = content.split('\n')
  const output = []
  let changed  = false

  for (const line of lines) {
    if (isSupabaseLine(line)) {
      const result = stripInvalidNames(line, validExports)

      if (result === null) {
        // Line entirely deleted
        changed = true
        // Don't push — line is gone.
        // We intentionally do NOT leave a blank line in its place;
        // the surrounding blank lines in the file naturally absorb the gap.
        continue
      }

      if (result !== line) changed = true
      output.push(result)
    } else {
      output.push(line)
    }
  }

  // Clean up: if deleting an import line left consecutive blank lines, collapse them.
  const collapsed = collapseBlankLines(output)
  const finalContent = collapsed.join('\n')
  const finalChanged = changed || (finalContent !== content)

  return { newContent: finalContent, changed: finalChanged }
}

// Collapse 3+ consecutive blank lines down to 2 (preserves intentional spacing).
function collapseBlankLines(lines) {
  const out = []
  let blanks = 0
  for (const line of lines) {
    if (line.trim() === '') {
      blanks++
      if (blanks <= 2) out.push(line)
    } else {
      blanks = 0
      out.push(line)
    }
  }
  return out
}

// ── Walk src/ ────────────────────────────────────────────────────────────────

function walkSrc(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!['node_modules', '.next', '.git', 'dist', 'out'].includes(entry.name)) {
        walkSrc(full, results)
      }
    } else if (['.ts', '.tsx'].includes(path.extname(entry.name))) {
      results.push(full)
    }
  }
  return results
}

function rel(p) { return path.relative(PROJECT_ROOT, p) }

// ── Build runner ──────────────────────────────────────────────────────────────

function runBuild() {
  console.log('\n  $ npm run build\n')
  const result = spawnSync('npm', ['run', 'build'], {
    cwd: PROJECT_ROOT,
    stdio: 'pipe',
    encoding: 'utf8',
    timeout: 6 * 60 * 1000,
  })
  const out = (result.stdout || '') + (result.stderr || '')
  return { success: result.status === 0, output: out }
}

// Parse build output for supabase-related import errors.
// Returns: { hasSupabaseErrors: bool, unknownNames: Set<string>, errorLines: string[] }
function parseBuildErrors(output) {
  const lines = output.split('\n')
  const errorLines = lines.filter(l =>
    l.includes('error TS') || l.includes('Type error') || l.includes('Module not found')
  )

  const supabaseErrors = errorLines.filter(l =>
    l.includes('supabase') || l.includes('@/lib/supabase') || l.includes('./supabase')
  )

  // Extract unknown export names from messages like:
  //   Module "@/lib/supabase" has no exported member 'Foo'
  //   "does not provide an export named 'Foo'"
  const unknownNames = new Set()
  const nameRe = /(?:has no exported member|does not provide an export named)\s+'(\w+)'/g
  let m
  while ((m = nameRe.exec(output)) !== null) {
    unknownNames.add(m[1])
  }

  return {
    hasSupabaseErrors: supabaseErrors.length > 0,
    unknownNames,
    errorLines,
    // Last 80 lines for display
    tail: lines.slice(-80).join('\n'),
  }
}

// ── Scan and patch ────────────────────────────────────────────────────────────

function scanAndPatch(validExports) {
  const files = walkSrc(SRC_DIR)
  const modified = []
  const skipped  = []

  for (const filePath of files) {
    // Never touch supabase.ts itself
    if (filePath === SUPABASE_FILE) {
      skipped.push({ file: rel(filePath), reason: 'is supabase.ts' })
      continue
    }

    let content
    try { content = fs.readFileSync(filePath, 'utf8') } catch (e) {
      console.log(`  ⚠️  Cannot read ${rel(filePath)}: ${e.message}`)
      continue
    }

    // Quick check: does this file even import from supabase?
    if (!SUPABASE_PATH_RE.test(content)) {
      skipped.push({ file: rel(filePath), reason: 'no supabase import' })
      continue
    }

    const { newContent, changed } = transformFile(content, validExports)

    if (!changed) {
      skipped.push({ file: rel(filePath), reason: 'already clean' })
      continue
    }

    try {
      fs.writeFileSync(filePath, newContent, 'utf8')
      modified.push(rel(filePath))
      console.log(`  ✅  ${rel(filePath)}`)
    } catch (e) {
      console.log(`  ❌  ${rel(filePath)}: write error — ${e.message}`)
    }
  }

  return { modified, skipped }
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  console.log('\n' + '═'.repeat(62))
  console.log('  clean-supabase-imports — strip invalid @/lib/supabase names')
  console.log('═'.repeat(62) + '\n')

  if (!fs.existsSync(SRC_DIR)) {
    console.error('❌  src/ not found. Run from your project root.\n')
    process.exit(1)
  }

  // ── Step 1: real export list ─────────────────────────────────────────────

  const validExports = extractValidExports(SUPABASE_FILE)
  console.log(`  Valid exports from supabase.ts (${validExports.size}):`)
  console.log(`    ${[...validExports].sort().join(', ')}\n`)
  console.log('  Everything else will be stripped from @/lib/supabase imports.\n')

  const allModified = []

  // ── Step 2: initial scan ─────────────────────────────────────────────────

  console.log('  Scanning src/ ...\n')
  const { modified } = scanAndPatch(validExports)
  allModified.push(...modified)

  if (modified.length === 0) {
    console.log('  ✅  No files needed changes.\n')
  }

  // ── Step 3: build loop ───────────────────────────────────────────────────

  const MAX_ATTEMPTS = 3
  let attempt = 0

  while (attempt < MAX_ATTEMPTS) {
    attempt++
    console.log(`\n${'─'.repeat(62)}`)
    console.log(`  Build attempt ${attempt}/${MAX_ATTEMPTS}`)
    console.log('─'.repeat(62))

    const { success, output } = runBuild()

    if (success) {
      // ── SUCCESS ──────────────────────────────────────────────────────────
      console.log('\n' + '═'.repeat(62))
      console.log('  ✅  BUILD PASSED')
      console.log('═'.repeat(62))

      if (allModified.length > 0) {
        console.log('\n  FILES MODIFIED:')
        allModified.forEach(f => console.log(`    ${f}`))
      } else {
        console.log('\n  FILES MODIFIED: none (project was already clean)')
      }

      console.log('\n  NEXT STEPS:')
      console.log('    git add -A')
      console.log('    git diff --stat HEAD   # verify scope of changes')
      console.log('    git commit -m "fix: strip invalid type imports from @/lib/supabase"')
      console.log('    git push origin main\n')
      process.exit(0)
    }

    // ── FAILED ───────────────────────────────────────────────────────────────

    const { hasSupabaseErrors, unknownNames, errorLines, tail } = parseBuildErrors(output)

    console.log('\n  Build output (last 80 lines):')
    console.log('  ' + tail.split('\n').join('\n  '))

    if (!hasSupabaseErrors) {
      // Failure is NOT supabase-import-related — stop here
      console.log('\n' + '═'.repeat(62))
      console.log('  ⚠️  BUILD FAILED — non-supabase error (no auto-fix)')
      console.log('═'.repeat(62))

      console.log('\n  FILES MODIFIED THIS RUN:')
      if (allModified.length > 0) {
        allModified.forEach(f => console.log(`    ${f}`))
      } else {
        console.log('    (none)')
      }

      console.log('\n  REMAINING BLOCKERS:')
      console.log('    The build error is NOT caused by supabase import issues.')
      console.log('    Fix the error shown above, then run this script again.\n')

      const firstError = errorLines.find(l => !l.includes('supabase'))
      if (firstError) {
        console.log('  FIRST NON-SUPABASE ERROR:')
        console.log(`    ${firstError.trim()}\n`)
      }

      process.exit(1)
    }

    // Has supabase errors — update the valid set with any names found,
    // then re-scan to catch files the first pass missed.
    if (unknownNames.size > 0) {
      console.log(`\n  Remaining unknown supabase exports: ${[...unknownNames].join(', ')}`)
      console.log('  Re-scanning to remove them...\n')

      // These names are definitively NOT in supabase.ts — ensure they're excluded
      // by just re-running the scan (validExports already excludes them)
      const { modified: extraFixed } = scanAndPatch(validExports)
      if (extraFixed.length > 0) {
        allModified.push(...extraFixed)
        console.log(`  Fixed ${extraFixed.length} additional file(s).`)
      } else {
        // Nothing new found — the imports may be in a file the regex didn't catch
        // (e.g., multi-line import). Report and stop.
        console.log('  ⚠️  No additional files found to fix.')
        console.log('      The remaining imports may be multi-line — see BLOCKERS below.')
        break
      }
    }
  }

  // ── Final failure ─────────────────────────────────────────────────────────

  console.log('\n' + '═'.repeat(62))
  console.log('  ⚠️  BUILD STILL FAILING after all attempts')
  console.log('═'.repeat(62))

  console.log('\n  FILES MODIFIED:')
  if (allModified.length > 0) {
    allModified.forEach(f => console.log(`    ${f}`))
  } else {
    console.log('    (none)')
  }

  console.log(`
  REMAINING BLOCKERS:
    One or more files contain multi-line imports that this script
    cannot patch automatically. Run this to find them:

      grep -rn "supabaseAdmin\\|ChatMessage\\|LeadStatus\\|Database" src/ \\
        --include="*.ts" --include="*.tsx" | grep "lib/supabase"

    For each result, manually remove the invalid name from the import.
    Valid names are: ${[...validExports].sort().join(', ')}
  `)

  process.exit(1)
}

main()
