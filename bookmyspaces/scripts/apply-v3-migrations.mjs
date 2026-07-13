#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// FILE: scripts/apply-v3-migrations.mjs
// V3 Sprint 3 — Priority 1: one-command deployment for migrations 012/013.
//
// WHY THIS EXISTS: migrations 012 and 013 have been reviewed, unit-tested
// against (schema-shaped mocks), and used as the target contract for every
// Reservation/Timeline/Unified-Conversation service written since Day 1 —
// but never actually applied to the live database, because every engineering
// sandbox this project has run in has no network route to Supabase (only an
// allowlisted set of hosts like the npm registry — confirmed again this
// session with a direct DNS/connect test, not just assumed from prior
// reports). Only a machine with real network access to your Supabase
// project — yours — can run this.
//
// WHAT IT DOES: connects directly to your Postgres database (not through the
// Supabase REST API, which can't run arbitrary DDL) and applies
// 012_v3_foundation_schema.sql, then 013_proposal_reservation_links.sql, in
// that order (013 depends on 012's tables). Both files are idempotent
// (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS) — safe to re-run.
//
// USAGE (run this yourself, from a machine with access to your Supabase
// project — your laptop, not this sandbox):
//
//   1. Get your database connection string from the Supabase dashboard:
//      Project Settings -> Database -> Connection string -> URI
//      (use the "Session pooler" or direct connection string; either works
//      for a one-off script like this).
//
//   2. Run:
//        DATABASE_URL="postgres://postgres:[password]@[host]:5432/postgres" npm run db:migrate:v3
//
//   3. To undo (see the ROLLBACK files' own warnings about data loss first):
//        DATABASE_URL="postgres://..." npm run db:rollback:v3
//
// This script refuses to run without DATABASE_URL set — it will not try to
// guess or construct one from NEXT_PUBLIC_SUPABASE_URL (that's a REST API
// URL, not a Postgres connection string, and the two are not
// interchangeable).
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations')

const isRollback = process.argv.includes('--rollback')

const FORWARD_FILES = [
  '012_v3_foundation_schema.sql',
  '013_proposal_reservation_links.sql',
]

// Reverse order for rollback: undo 013's additions before dropping the 012
// tables they reference.
const ROLLBACK_FILES = [
  '013_proposal_reservation_links_ROLLBACK.sql',
  '012_v3_foundation_schema_ROLLBACK.sql',
]

const files = isRollback ? ROLLBACK_FILES : FORWARD_FILES

function fail(message) {
  console.error(`\n❌ ${message}\n`)
  process.exit(1)
}

if (!process.env.DATABASE_URL) {
  fail(
    'DATABASE_URL is not set.\n\n' +
    '  Get it from: Supabase Dashboard -> Project Settings -> Database -> Connection string -> URI\n\n' +
    '  Then run:\n' +
    '    DATABASE_URL="postgres://postgres:[password]@[host]:5432/postgres" npm run db:migrate:v3'
  )
}

if (isRollback) {
  console.log('⚠️  ROLLBACK MODE — this will DROP the migration 012 tables and their data.')
  console.log('    Reservations, unified conversations, properties, inventory, etc. will be permanently deleted.')
  console.log('    Take a pg_dump first if there is any doubt. Ctrl+C now to abort.\n')
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })

try {
  await client.connect()
  console.log(`Connected. Applying ${files.length} file(s) in order:\n`)

  for (const file of files) {
    const fullPath = path.join(migrationsDir, file)
    console.log(`  -> ${file}`)
    const sql = readFileSync(fullPath, 'utf8')
    await client.query(sql)
    console.log(`     done`)
  }

  if (!isRollback) {
    console.log('\nVerifying...')
    const { rows } = await client.query(
      "select (select count(*) from properties) as properties, " +
      "(select count(*) from inventory_items) as inventory_items, " +
      "(select count(*) from reservations) as reservations"
    )
    console.log(`  properties: ${rows[0].properties}, inventory_items: ${rows[0].inventory_items}, reservations: ${rows[0].reservations}`)
    console.log('\n✅ Migrations 012 and 013 applied successfully.')
    console.log('   Next: add real inventory_items/rate_plans rows for your properties (currently seeded with just the two properties, no rooms/rates yet),')
    console.log('   then the Reservation Dashboard/Calendar in the app will have real data to show.')
  } else {
    console.log('\n✅ Rollback complete. Migration 012/013 tables have been dropped.')
  }
} catch (err) {
  fail(`Migration failed: ${err.message}\n\n${err.stack ?? ''}`)
} finally {
  await client.end()
}
