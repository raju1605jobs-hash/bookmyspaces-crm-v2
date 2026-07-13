#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// FILE: scripts/smoke-test-v3.mjs
// V3 Sprint 4 — Priority 1: post-migration validation.
//
// WHY THIS EXISTS: migrations 012/013 have been reviewed and unit-tested
// against schema-shaped mocks for four sessions, but never executed against
// a real Postgres instance (this sandbox has no network route to Supabase —
// see scripts/apply-v3-migrations.mjs's header, re-confirmed again this
// session via a direct DNS/connect test). Run this immediately after
// `npm run db:migrate:v3` succeeds, from the same machine, using the same
// DATABASE_URL. It does NOT modify any real data — every write it performs
// happens inside a transaction that is always rolled back at the end,
// success or failure.
//
// WHAT IT CHECKS:
//   1. Every migration 012 table exists.
//   2. Migration 013's five columns exist on the (already-live) `proposals`
//      table.
//   3. The FKs the app's services actually rely on are really enforced
//      (reservations -> properties/inventory_items/proposals,
//      proposals -> reservations).
//   4. The indexes availability-service.ts and the dashboard queries are
//      built to use actually exist (idx_reservations_dates,
//      idx_reservations_status, idx_knowledge_sources_embedding).
//   5. RLS is enabled with a service_role policy on every new table — the
//      same posture as every existing table in this project.
//   6. The two seed properties (skyline-serenity, monurama-homestay) are
//      present.
//   7. A FUNCTIONAL test: inserts a throwaway inventory_item + rate_plan +
//      two reservations under a real property, then runs the exact overlap
//      query availability-service.ts's checkAvailability() issues
//      (inventory_item_id match, status IN blocking states, check_in_date <
//      requested checkout, check_out_date > requested checkin) and asserts
//      it correctly reports a conflict for overlapping dates and no
//      conflict for non-overlapping dates. This is the one thing manual
//      schema review cannot confirm on its own — that Postgres's actual
//      date-range comparison behaves the way availability-service.ts
//      assumes it does. Everything from this step is inside one transaction
//      that gets ROLLBACK'd at the very end, real property row untouched.
//
// USAGE (same machine/DATABASE_URL as db:migrate:v3):
//   DATABASE_URL="postgres://postgres:[password]@[host]:5432/postgres" npm run db:smoke-test:v3
// ─────────────────────────────────────────────────────────────────────────────

import pg from 'pg'

function fail(message) {
  console.error(`\n❌ ${message}\n`)
  process.exit(1)
}

if (!process.env.DATABASE_URL) {
  fail(
    'DATABASE_URL is not set.\n\n' +
    '  Run this right after `npm run db:migrate:v3`, with the same DATABASE_URL:\n' +
    '    DATABASE_URL="postgres://postgres:[password]@[host]:5432/postgres" npm run db:smoke-test:v3'
  )
}

const REQUIRED_TABLES = [
  'properties', 'customer_identities', 'channels', 'unified_conversations',
  'unified_conversation_channels', 'unified_messages', 'inventory_items',
  'meal_plans', 'rate_plans', 'addon_services', 'reservations',
  'reservation_addons', 'settings', 'ai_prompts', 'knowledge_sources',
  'ai_interaction_log',
]

const REQUIRED_PROPOSAL_COLUMNS = [
  'property_id', 'inventory_item_id', 'reservation_id', 'package_id', 'addon_service_ids',
]

// Sprint 4 addition: caught during the end-to-end workflow trace that
// ai_interaction_log originally had no lead_id/interaction_type/summary
// columns even though timeline-service.ts's fetchAIInteractionEntries()
// has queried all three since Day 4. Fixed in the migration itself (still
// pre-application at the time) — checked here so this class of drift gets
// caught by the smoke test instead of silently degrading forever.
const REQUIRED_AI_LOG_COLUMNS = ['lead_id', 'interaction_type', 'summary']

const REQUIRED_FKS = [
  { table: 'reservations', column: 'property_id', references: 'properties' },
  { table: 'reservations', column: 'inventory_item_id', references: 'inventory_items' },
  { table: 'reservations', column: 'proposal_id', references: 'proposals' },
  { table: 'proposals', column: 'reservation_id', references: 'reservations' },
  { table: 'ai_interaction_log', column: 'lead_id', references: 'leads' },
]

const REQUIRED_INDEXES = [
  'idx_reservations_dates', 'idx_reservations_status', 'idx_reservations_inventory_item_id',
  'idx_knowledge_sources_embedding',
]

const RLS_TABLES = REQUIRED_TABLES // every migration-012 table should have RLS + a service_role policy

let passed = 0
let failedChecks = []

function report(name, ok, detail) {
  if (ok) {
    passed += 1
    console.log(`  ✅ ${name}`)
  } else {
    failedChecks.push(name)
    console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`)
  }
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })

try {
  await client.connect()
  console.log('Connected.\n')

  // ── 1. Tables exist ────────────────────────────────────────────────────
  console.log('── Tables (migration 012) ──')
  {
    const { rows } = await client.query(
      `select table_name from information_schema.tables where table_schema = 'public' and table_name = ANY($1::text[])`,
      [REQUIRED_TABLES]
    )
    const present = new Set(rows.map((r) => r.table_name))
    for (const t of REQUIRED_TABLES) report(t, present.has(t))
  }

  // ── 2. proposals columns (migration 013) ───────────────────────────────
  console.log('\n── proposals columns (migration 013) ──')
  {
    const { rows } = await client.query(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'proposals' and column_name = ANY($1::text[])`,
      [REQUIRED_PROPOSAL_COLUMNS]
    )
    const present = new Set(rows.map((r) => r.column_name))
    for (const c of REQUIRED_PROPOSAL_COLUMNS) report(`proposals.${c}`, present.has(c))
  }

  // ── 2b. ai_interaction_log columns (Sprint 4 fix, see comment above) ────
  console.log('\n── ai_interaction_log columns ──')
  {
    const { rows } = await client.query(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'ai_interaction_log' and column_name = ANY($1::text[])`,
      [REQUIRED_AI_LOG_COLUMNS]
    )
    const present = new Set(rows.map((r) => r.column_name))
    for (const c of REQUIRED_AI_LOG_COLUMNS) report(`ai_interaction_log.${c}`, present.has(c))
  }

  // ── 3. Foreign keys ─────────────────────────────────────────────────────
  console.log('\n── Foreign keys ──')
  for (const fk of REQUIRED_FKS) {
    const { rows } = await client.query(
      `select 1
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name
       join information_schema.constraint_column_usage ccu on tc.constraint_name = ccu.constraint_name
       where tc.constraint_type = 'FOREIGN KEY'
         and tc.table_name = $1 and kcu.column_name = $2 and ccu.table_name = $3`,
      [fk.table, fk.column, fk.references]
    )
    report(`${fk.table}.${fk.column} -> ${fk.references}`, rows.length > 0)
  }

  // ── 4. Indexes ──────────────────────────────────────────────────────────
  console.log('\n── Indexes ──')
  {
    const { rows } = await client.query(
      `select indexname from pg_indexes where schemaname = 'public' and indexname = ANY($1::text[])`,
      [REQUIRED_INDEXES]
    )
    const present = new Set(rows.map((r) => r.indexname))
    for (const idx of REQUIRED_INDEXES) report(idx, present.has(idx))
  }

  // ── 5. RLS + service_role policy ───────────────────────────────────────
  console.log('\n── Row Level Security ──')
  {
    const { rows: rlsRows } = await client.query(
      `select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = ANY($1::text[]) and c.relrowsecurity = true`,
      [RLS_TABLES]
    )
    const rlsOn = new Set(rlsRows.map((r) => r.relname))
    const { rows: policyRows } = await client.query(
      `select tablename from pg_policies where schemaname = 'public' and tablename = ANY($1::text[])`,
      [RLS_TABLES]
    )
    const hasPolicy = new Set(policyRows.map((r) => r.tablename))
    for (const t of RLS_TABLES) {
      report(`${t}: RLS enabled + policy present`, rlsOn.has(t) && hasPolicy.has(t))
    }
  }

  // ── 6. Seed properties ──────────────────────────────────────────────────
  console.log('\n── Seed data ──')
  {
    const { rows } = await client.query(`select slug from properties where slug = ANY($1::text[])`, [['skyline-serenity', 'monurama-homestay']])
    const slugs = new Set(rows.map((r) => r.slug))
    report('properties: skyline-serenity seeded', slugs.has('skyline-serenity'))
    report('properties: monurama-homestay seeded', slugs.has('monurama-homestay'))
  }

  // ── 7. Functional test — mirrors availability-service.ts exactly ───────
  console.log('\n── Functional test (transactional, rolled back) ──')
  await client.query('BEGIN')
  try {
    const { rows: propRows } = await client.query(`select id from properties where slug = 'skyline-serenity' limit 1`)
    if (propRows.length === 0) throw new Error('no seeded property to test against')
    const propertyId = propRows[0].id

    const { rows: itemRows } = await client.query(
      `insert into inventory_items (property_id, inventory_type, name, max_occupancy, base_capacity)
       values ($1, 'room', '__smoke_test_room__', 2, 2) returning id`,
      [propertyId]
    )
    const inventoryItemId = itemRows[0].id
    report('insert throwaway inventory_item', true)

    await client.query(
      `insert into rate_plans (inventory_item_id, rate_type, price) values ($1, 'base', 5000)`,
      [inventoryItemId]
    )
    report('insert throwaway rate_plan', true)

    // Existing reservation: 2026-09-10 -> 2026-09-14
    await client.query(
      `insert into reservations (guest_name, property_id, inventory_item_id, check_in_date, check_out_date, status)
       values ('__smoke_test_guest__', $1, $2, '2026-09-10', '2026-09-14', 'confirmed')`,
      [propertyId, inventoryItemId]
    )
    report('insert throwaway reservation (2026-09-10 -> 2026-09-14, confirmed)', true)

    // checkAvailability()'s exact query shape, for an overlapping request (2026-09-12 -> 2026-09-16)
    const overlapCheckIn = '2026-09-12'
    const overlapCheckOut = '2026-09-16'
    const { rows: overlapRows } = await client.query(
      `select id, check_in_date, check_out_date from reservations
       where inventory_item_id = $1
         and status = ANY($2::text[])
         and check_in_date < $3
         and check_out_date > $4`,
      [inventoryItemId, ['inquiry', 'tentative', 'confirmed', 'checked_in'], overlapCheckOut, overlapCheckIn]
    )
    report(
      'overlap query correctly finds a conflict for 2026-09-12 -> 2026-09-16',
      overlapRows.length === 1
    )

    // Same query shape, for a genuinely free range (2026-10-01 -> 2026-10-03)
    const freeCheckIn = '2026-10-01'
    const freeCheckOut = '2026-10-03'
    const { rows: freeRows } = await client.query(
      `select id from reservations
       where inventory_item_id = $1
         and status = ANY($2::text[])
         and check_in_date < $3
         and check_out_date > $4`,
      [inventoryItemId, ['inquiry', 'tentative', 'confirmed', 'checked_in'], freeCheckOut, freeCheckIn]
    )
    report(
      'overlap query correctly finds no conflict for 2026-10-01 -> 2026-10-03',
      freeRows.length === 0
    )

    // `nights` generated column sanity check
    const { rows: nightsRows } = await client.query(
      `select nights from reservations where inventory_item_id = $1 limit 1`,
      [inventoryItemId]
    )
    report('reservations.nights generated column computes correctly (4 nights)', nightsRows[0]?.nights === 4)
  } finally {
    await client.query('ROLLBACK')
    console.log('  (transaction rolled back — no test data left behind)')
  }

  // ── Summary ───────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(60)}`)
  if (failedChecks.length === 0) {
    console.log(`✅ All ${passed} checks passed. Migrations 012/013 are structurally sound and functionally correct.`)
    console.log('   Next: add real inventory_items/rate_plans for both properties through the app or SQL Editor,')
    console.log('   then re-verify the Reservation Dashboard, Calendar, and availability check against real data.')
  } else {
    console.log(`❌ ${failedChecks.length} check(s) failed out of ${passed + failedChecks.length}:`)
    failedChecks.forEach((c) => console.log(`   - ${c}`))
    process.exitCode = 1
  }
} catch (err) {
  fail(`Smoke test failed: ${err.message}\n\n${err.stack ?? ''}`)
} finally {
  await client.end()
}
