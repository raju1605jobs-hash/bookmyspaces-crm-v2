#!/usr/bin/env node
// ============================================================
// fix-deployment.js
// BookMySpaces CRM — Vercel Deployment Fix
// Run from project root: node fix-deployment.js
// ============================================================

const fs = require('fs')
const path = require('path')

// ── CONFIGURATION ─────────────────────────────────────────────────────────

const SRC_ROOT = path.join(process.cwd(), 'src')
const APP_DIR  = path.join(SRC_ROOT, 'app')

// Patterns that indicate a page makes live data calls at render time.
// Any file matching ANY of these needs force-dynamic.
const DATA_FETCH_PATTERNS = [
  /from ['"]@\/lib\/supabase['"]/,
  /createClient\(/,
  /supabaseAdmin/,
  /supabase\.(from|rpc|storage|auth)/,
  /\.from\(['"]\w/,
  /fetch\(['"](https?|\/api)\//,
  /await fetch\(/,
  /getServerSession/,
  /cookies\(\)/,
  /headers\(\)/,
  /searchParams/,
  /generateStaticParams/,
]

// These are never pages — skip them
const SKIP_FILES = [
  'layout.tsx',    // handled separately below
  'loading.tsx',
  'error.tsx',
  'not-found.tsx',
  'template.tsx',
  'global-error.tsx',
]

// These specific layouts need force-dynamic (they do auth/session checks)
const LAYOUTS_TO_FIX = [
  path.join(APP_DIR, 'dashboard', 'layout.tsx'),
]

const FORCE_DYNAMIC_EXPORT = `export const dynamic = 'force-dynamic'\n`

// ── HELPERS ───────────────────────────────────────────────────────────────

function getAllTsxFiles(dir, results = []) {
  if (!fs.existsSync(dir)) return results
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      // Skip api routes — they're never statically rendered
      if (entry.name === 'api') continue
      getAllTsxFiles(fullPath, results)
    } else if (
      (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) &&
      !SKIP_FILES.includes(entry.name)
    ) {
      results.push(fullPath)
    }
  }
  return results
}

function alreadyHasDynamic(content) {
  return (
    content.includes("export const dynamic = 'force-dynamic'") ||
    content.includes('export const dynamic = "force-dynamic"') ||
    content.includes("export const dynamic='force-dynamic'") ||
    content.includes('export const dynamic="force-dynamic"')
  )
}

function needsDynamic(content) {
  // Client components handle their own data fetching at runtime — skip them
  const isClientComponent =
    content.trimStart().startsWith("'use client'") ||
    content.trimStart().startsWith('"use client"')
  if (isClientComponent) return false

  // Check if any data-fetch pattern is present
  return DATA_FETCH_PATTERNS.some((pattern) => pattern.test(content))
}

function insertForceDynamic(content, filePath) {
  const lines = content.split('\n')

  // Find insertion point: after the last import line, before actual code
  let lastImportLine = -1
  let useClientLine = -1

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (trimmed === "'use client'" || trimmed === '"use client"') {
      useClientLine = i
    }
    if (
      trimmed.startsWith('import ') ||
      (trimmed.startsWith('import{') ) ||
      trimmed.startsWith('import type ')
    ) {
      lastImportLine = i
    }
  }

  const insertAfter = lastImportLine >= 0 ? lastImportLine : useClientLine

  if (insertAfter >= 0) {
    lines.splice(insertAfter + 1, 0, '', FORCE_DYNAMIC_EXPORT.trim())
    return lines.join('\n')
  }

  // No imports found — prepend
  return FORCE_DYNAMIC_EXPORT + '\n' + content
}

function fixGenerateStaticParams(content) {
  // If file has generateStaticParams that makes external calls, neutralize it
  // Pattern: async function generateStaticParams that has await in body
  const hasGenerateStaticParams = /export\s+async\s+function\s+generateStaticParams/.test(content)
  if (!hasGenerateStaticParams) return content

  // Replace with safe empty version
  return content.replace(
    /export\s+async\s+function\s+generateStaticParams\s*\([^)]*\)\s*\{[\s\S]*?\n\}/,
    `export async function generateStaticParams() {\n  return []\n}`
  )
}

// ── MAIN ──────────────────────────────────────────────────────────────────

function run() {
  console.log('\n' + '═'.repeat(60))
  console.log('  BookMySpaces — Deployment Fix: force-dynamic patcher')
  console.log('═'.repeat(60) + '\n')

  if (!fs.existsSync(APP_DIR)) {
    console.error('❌  Could not find src/app directory.')
    console.error('    Run this script from your project root.\n')
    process.exit(1)
  }

  // Gather all page files
  const pageFiles = getAllTsxFiles(APP_DIR)

  // Also add specific layouts
  for (const layoutPath of LAYOUTS_TO_FIX) {
    if (fs.existsSync(layoutPath) && !pageFiles.includes(layoutPath)) {
      pageFiles.push(layoutPath)
    }
  }

  const results = {
    fixed: [],
    skippedClientComponent: [],
    skippedNoDataCalls: [],
    skippedAlreadyFixed: [],
    missing: [],
    errors: [],
  }

  for (const filePath of pageFiles) {
    const rel = path.relative(process.cwd(), filePath)

    if (!fs.existsSync(filePath)) {
      results.missing.push(rel)
      continue
    }

    let content
    try {
      content = fs.readFileSync(filePath, 'utf8')
    } catch (e) {
      results.errors.push({ file: rel, error: e.message })
      continue
    }

    if (alreadyHasDynamic(content)) {
      results.skippedAlreadyFixed.push(rel)
      continue
    }

    const isClientComponent =
      content.trimStart().startsWith("'use client'") ||
      content.trimStart().startsWith('"use client"')

    if (isClientComponent) {
      results.skippedClientComponent.push(rel)
      continue
    }

    if (!needsDynamic(content)) {
      results.skippedNoDataCalls.push(rel)
      continue
    }

    try {
      let newContent = insertForceDynamic(content, filePath)
      newContent = fixGenerateStaticParams(newContent)
      fs.writeFileSync(filePath, newContent, 'utf8')
      results.fixed.push(rel)
    } catch (e) {
      results.errors.push({ file: rel, error: e.message })
    }
  }

  // ── Print results ──────────────────────────────────────────────────────

  if (results.fixed.length > 0) {
    console.log('✅  FIXED — force-dynamic added:')
    results.fixed.forEach((f) => console.log(`    ${f}`))
    console.log()
  }

  if (results.skippedAlreadyFixed.length > 0) {
    console.log('⚡  ALREADY FIXED:')
    results.skippedAlreadyFixed.forEach((f) => console.log(`    ${f}`))
    console.log()
  }

  if (results.skippedClientComponent.length > 0) {
    console.log('🔵  SKIPPED — Client Components (safe, no action needed):')
    results.skippedClientComponent.forEach((f) => console.log(`    ${f}`))
    console.log()
  }

  if (results.skippedNoDataCalls.length > 0) {
    console.log('⚪  SKIPPED — No data calls detected:')
    results.skippedNoDataCalls.forEach((f) => console.log(`    ${f}`))
    console.log()
  }

  if (results.errors.length > 0) {
    console.log('❌  ERRORS:')
    results.errors.forEach(({ file, error }) =>
      console.log(`    ${file}: ${error}`)
    )
    console.log()
  }

  // ── Summary ────────────────────────────────────────────────────────────

  console.log('─'.repeat(60))
  console.log(`  Fixed:          ${results.fixed.length} files`)
  console.log(`  Already fixed:  ${results.skippedAlreadyFixed.length} files`)
  console.log(`  Client comps:   ${results.skippedClientComponent.length} files (skipped, correct)`)
  console.log(`  No data calls:  ${results.skippedNoDataCalls.length} files (skipped, correct)`)
  console.log(`  Errors:         ${results.errors.length} files`)
  console.log('─'.repeat(60))

  if (results.errors.length > 0) {
    console.log('\n⚠️   Some files had errors. Fix them manually using MANUAL_PATCHES.md\n')
    process.exit(1)
  }

  console.log('\n🚀  Next steps:')
  console.log('    1.  npm run build')
  console.log('        Look for ƒ (lambda) next to every CRM route')
  console.log('    2.  git add -A')
  console.log('        git commit -m "fix: force-dynamic — prevent Vercel build hang"')
  console.log('    3.  git push origin main\n')
}

run()
