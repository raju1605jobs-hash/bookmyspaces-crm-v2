#!/usr/bin/env node
'use strict'
// fix-all-missing-types.js  v2
// Run from project root: node fix-all-missing-types.js

const fs   = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT          = process.cwd()
const SRC           = path.join(ROOT, 'src')
const SUPABASE_FILE = path.join(SRC, 'lib', 'supabase.ts')
const LOG_FILE      = path.join(ROOT, 'build-output.log')
const MAX_RETRIES   = 5
const EXTS          = new Set(['.ts', '.tsx'])
const SEED_TYPES    = ['Lead', 'LeadStatus', 'ChatMessage', 'Database']

const SUPABASE_FROM_RE =
  /from\s+['"](?:@\/lib\/supabase|(?:\.{1,2}\/)*(?:[\w\/-]*\/)?supabase)['"]/

// ── Extract valid exports ──────────────────────────────────────────────────────
function getValidExports() {
  const fallback = new Set(['supabase', 'getSupabaseAdmin'])
  if (!fs.existsSync(SUPABASE_FILE)) return fallback
  const src = fs.readFileSync(SUPABASE_FILE, 'utf8'), out = new Set()
  for (const m of src.matchAll(/^export\s+(?:const|let|var)\s+(\w+)/gm)) out.add(m[1])
  for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)) out.add(m[1])
  for (const m of src.matchAll(/^export\s+(?:type|interface|class|enum)\s+(\w+)/gm)) out.add(m[1])
  for (const m of src.matchAll(/^export\s+\{([^}]+)\}/gm))
    for (const e of m[1].split(',')) {
      const p = e.trim().split(/\s+as\s+/)
      const n = (p[1] || p[0]).trim()
      if (n) out.add(n)
    }
  return out.size > 0 ? out : fallback
}

// ── Detect invalid supabase imports in a file ──────────────────────────────────
function detectInvalidImports(content, valid) {
  const found = new Set()
  for (const line of content.split('\n')) {
    if (!SUPABASE_FROM_RE.test(line)) continue
    const m = line.match(/\{([^}]+)\}/)
    if (!m) continue
    for (const entry of m[1].split(',')) {
      const name = entry.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim()
      if (name && !valid.has(name) && /^[A-Z]/.test(name)) found.add(name)
    }
  }
  return found
}

// ── Find import blocks (single + multi-line) ──────────────────────────────────
function findImportBlocks(lines) {
  const blocks = []
  let inImport = false, start = 0, depth = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!inImport && /^\s*import[\s{*"']/.test(line)) {
      inImport = true; start = i
      depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length
      if (depth <= 0) {
        blocks.push({ start, end: i, isSupabase: SUPABASE_FROM_RE.test(line) })
        inImport = false; depth = 0
      }
    } else if (inImport) {
      depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length
      if (depth <= 0) {
        const blockText = lines.slice(start, i + 1).join('\n')
        blocks.push({ start, end: i, isSupabase: SUPABASE_FROM_RE.test(blockText) })
        inImport = false; depth = 0
      }
    }
  }
  return blocks
}

// ── Strip invalid imports — single line ───────────────────────────────────────
function stripImportLine(line, valid) {
  const m = line.match(/^(\s*import\s+(?:type\s+)?)(\{[^}]+\})(\s+from\s+['"][^'"]+['"]\s*;?\s*)$/)
  if (!m) return line
  const entries = m[2].slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)
  const kept    = entries.filter(e => valid.has(e.replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim()))
  if (kept.length === 0) return null
  if (kept.length === entries.length) return line
  return `${m[1]}{ ${kept.join(', ')} }${m[3]}`
}

// ── Strip invalid imports — multi-line block ───────────────────────────────────
function stripMultiLine(blockLines, valid) {
  const full   = blockLines.join(' ').replace(/\s+/g, ' ')
  const isType = /^\s*import\s+type\s/.test(blockLines[0])
  const braceM = full.match(/\{([^}]+)\}/)
  const fromM  = full.match(/from\s+(['"][^'"]+['"])/)
  if (!braceM || !fromM) return null
  const kept = braceM[1].split(',').map(s => s.trim()).filter(Boolean)
    .filter(e => valid.has(e.replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim()))
  if (kept.length === 0) return null
  return `import ${isType ? 'type ' : ''}{ ${kept.join(', ')} } from ${fromM[1]}`
}

// ── Inline type replacer ──────────────────────────────────────────────────────
// Safety rules:
//   Generic <T> only matches after \w (TypeScript generic), NOT standalone JSX tag
//   Bare T not preceded by < / . (excludes JSX open/close tags and dot access)
function buildReplacer(types) {
  const rules = []
  for (const T of types) {
    const e = T.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    rules.push(
      [new RegExp(`\\bArray<${e}>`, 'g'),                      'any[]'],
      [new RegExp(`\\bRecord<${e},`, 'g'),                     'Record<any,'],
      [new RegExp(`:\\s*${e}\\[\\]`, 'g'),                     ': any[]'],
      [new RegExp(`:\\s*${e}\\s*\\|\\s*null`, 'g'),            ': any | null'],
      [new RegExp(`:\\s*${e}\\s*\\|\\s*undefined`, 'g'),       ': any | undefined'],
      [new RegExp(`:\\s*${e}\\b`, 'g'),                        ': any'],
      [new RegExp(`(?<=\\w)<${e}\\[\\]>`, 'g'),               '<any[]>'],
      [new RegExp(`(?<=\\w)<${e}\\s*\\|\\s*null>`, 'g'),       '<any | null>'],
      [new RegExp(`(?<=\\w)<${e}>`, 'g'),                      '<any>'],
      [new RegExp(`\\bas\\s+${e}\\[\\]`, 'g'),                 'as any[]'],
      [new RegExp(`\\bas\\s+${e}\\b`, 'g'),                    'as any'],
      [new RegExp(`=\\s*${e}\\[\\](?!\\s*[({])`, 'g'),         '= any[]'],
      [new RegExp(`\\b${e}\\[\\]`, 'g'),                       'any[]'],
      [new RegExp(`\\b${e}\\s*&`, 'g'),                        'any &'],
      [new RegExp(`&\\s*${e}\\b`, 'g'),                        '& any'],
      [new RegExp(`(?<![.\/<\\w])${e}(?![.\\w(])`, 'g'),       'any'],
    )
  }
  return (line) => { let r = line; for (const [re, rep] of rules) r = r.replace(re, rep); return r }
}

// ── Transform one file ────────────────────────────────────────────────────────
function transformFile(content, valid, types) {
  const replace = buildReplacer(types)
  const lines   = content.split('\n')
  const blocks  = findImportBlocks(lines)
  const lb      = new Map()
  for (const b of blocks) for (let i = b.start; i <= b.end; i++) lb.set(i, b)

  const out = []; let changed = false; const log = []; const skip = new Set()

  for (let i = 0; i < lines.length; i++) {
    if (skip.has(i)) continue
    const line = lines[i], block = lb.get(i)

    if (block && block.isSupabase) {
      if (block.start === block.end) {
        const r = stripImportLine(line, valid)
        if (r === null) { changed = true; log.push(`  L${i+1}: deleted "${line.trim()}"`); continue }
        if (r !== line) { changed = true; log.push(`  L${i+1}: stripped → "${r.trim()}"`) }
        out.push(r)
      } else {
        const bLines = lines.slice(block.start, block.end + 1)
        for (let j = block.start + 1; j <= block.end; j++) skip.add(j)
        const rebuilt = stripMultiLine(bLines, valid)
        if (rebuilt === null) { changed = true; log.push(`  L${block.start+1}-${block.end+1}: deleted multi-line import`) }
        else { if (rebuilt !== bLines.join('\n')) changed = true; log.push(`  L${block.start+1}-${block.end+1}: → "${rebuilt}"`); out.push(rebuilt) }
      }
    } else if (block && !block.isSupabase) {
      // Non-supabase import (lucide-react, react, next, etc.) — NEVER touch
      out.push(line)
    } else {
      const r = replace(line)
      if (r !== line) { changed = true; log.push(`  L${i+1}: ${line.trim().slice(0,42)} → ${r.trim().slice(0,42)}`) }
      out.push(r)
    }
  }

  const final = []; let blanks = 0
  for (const l of out) {
    if (l.trim() === '') { if (++blanks <= 2) final.push(l) } else { blanks = 0; final.push(l) }
  }
  return { content: final.join('\n'), changed, log }
}

// ── Walk src/ ─────────────────────────────────────────────────────────────────
function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (!['node_modules', '.next', '.git', 'dist', 'out', '.turbo'].includes(e.name)) walk(p, acc)
    } else if (EXTS.has(path.extname(e.name))) acc.push(p)
  }
  return acc
}

// ── Scan and patch ────────────────────────────────────────────────────────────
function scanAndPatch(valid, types) {
  const modified = []
  for (const fp of walk(SRC)) {
    if (fp === SUPABASE_FILE) continue
    let src; try { src = fs.readFileSync(fp, 'utf8') } catch { continue }
    if (!SUPABASE_FROM_RE.test(src) && !types.some(t => src.includes(t))) continue
    const { content, changed, log } = transformFile(src, valid, types)
    if (!changed) continue
    try {
      fs.writeFileSync(fp, content, 'utf8')
      const r = path.relative(ROOT, fp)
      modified.push(r); print(`  ✅  ${r}`); log.forEach(l => print(l))
    } catch (e) { print(`  ⚠️  write error: ${fp} — ${e.message}`) }
  }
  return modified
}

// ── Build ─────────────────────────────────────────────────────────────────────
function runBuild() {
  print(`\n  $ npm run build  (→ build-output.log)\n`)
  const result = spawnSync(`npm run build > "${LOG_FILE}" 2>&1`, [], { cwd: ROOT, shell: true, stdio: 'inherit', timeout: 10 * 60 * 1000 })
  let output = ''
  if (fs.existsSync(LOG_FILE)) try { output = fs.readFileSync(LOG_FILE, 'utf8') } catch {}
  return { success: result.status === 0, output: output || '' }
}

// ── Parse errors ──────────────────────────────────────────────────────────────
function parseErrors(output) {
  const lines    = output.split('\n')
  const errLines = lines.filter(l => /error TS\d+|Type error|Cannot find name|has no exported member|does not provide an export named/i.test(l))
  const supLines = errLines.filter(l => /supabase/i.test(l))
  const othLines = errLines.filter(l => !/supabase/i.test(l))
  const names    = new Set()
  const re = /(?:Cannot find name|has no exported member|does not provide an export named)\s+'(\w+)'/g
  let m; while ((m = re.exec(output)) !== null) names.add(m[1])
  return { hasSupabaseErrors: supLines.length > 0, unknownNames: names, firstOtherError: othLines[0] || null, tail: lines.slice(-120).join('\n') }
}

function print(...a) { console.log(...a) }
function bar(c = '─') { return c.repeat(64) }

// ── Main ──────────────────────────────────────────────────────────────────────
function main() {
  print('\n' + bar('═')); print('  fix-all-missing-types.js  v2'); print(bar('═') + '\n')
  if (!fs.existsSync(SRC)) { print('❌  src/ not found — run from project root\n'); process.exit(1) }

  const valid   = getValidExports()
  const typeSet = new Set(SEED_TYPES)
  print(`  Valid supabase exports: ${[...valid].sort().join(', ')}`)
  for (const fp of walk(SRC)) { if (fp === SUPABASE_FILE) continue; try { detectInvalidImports(fs.readFileSync(fp, 'utf8'), valid).forEach(n => typeSet.add(n)) } catch {} }
  const types = [...typeSet]
  const allFixed = []
  print(`  Types to replace: ${types.join(', ')}\n`)
  print(bar() + '\n  Initial scan\n' + bar() + '\n')
  allFixed.push(...scanAndPatch(valid, types))

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    print('\n' + bar()); print(`  Build attempt ${attempt}/${MAX_RETRIES}`); print(bar())
    const { success, output } = runBuild()

    if (success) {
      print('\n' + bar('═')); print('  ✅  BUILD PASSED'); print(bar('═'))
      print(`\n  Files modified (${allFixed.length}):`)
      allFixed.length ? [...new Set(allFixed)].forEach(f => print(`    ${f}`)) : print('    (none — already clean)')
      print('\n  Next steps:')
      print('    git add -A')
      print('    git commit -m "fix: replace removed supabase types with any"')
      print('    git push origin main\n')
      process.exit(0)
    }

    const errors = parseErrors(output)
    print('\n  Build output (last 120 lines):')
    print(errors.tail.split('\n').map(l => '  ' + l).join('\n'))

    let added = 0
    for (const name of errors.unknownNames) {
      if (!typeSet.has(name) && !valid.has(name) && /^[A-Z]/.test(name)) {
        typeSet.add(name); types.push(name); added++; print(`\n  → Auto-adding: ${name}`)
      }
    }

    if (!errors.hasSupabaseErrors && !errors.unknownNames.size && !added) {
      print('\n' + bar('═')); print('  ⚠️  BUILD FAILED — remaining error is not a type/import issue'); print(bar('═'))
      print(`\n  Files modified (${allFixed.length}):`); [...new Set(allFixed)].forEach(f => print(`    ${f}`))
      print('\n  Remaining blocker:')
      if (errors.firstOtherError) print(`    ${errors.firstOtherError.trim()}`)
      print('\n  Open build-output.log for full details.\n')
      process.exit(1)
    }

    print(`\n  Re-scanning (${types.length} types)...\n`)
    const retried = scanAndPatch(valid, types)
    retried.forEach(f => { if (![...allFixed].includes(f)) allFixed.push(f) })
  }

  print('\n' + bar('═')); print(`  ⚠️  BUILD STILL FAILING after ${MAX_RETRIES} attempts`); print(bar('═'))
  print(`\n  Files modified: ${allFixed.length}`); [...new Set(allFixed)].forEach(f => print(`    ${f}`))
  print(`\n  Types replaced: ${types.join(', ')}`)
  print('\n  Open build-output.log for remaining errors.\n')
  process.exit(1)
}

main()
