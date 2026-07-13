-- ═══════════════════════════════════════════════════════════
-- BOOKMYSPACES V3 — 012 FOUNDATION SCHEMA
-- Additive only. No existing table/column is altered or dropped.
-- Safe to re-run: uses IF NOT EXISTS everywhere, matching house style.
--
-- NOT YET APPLIED to the live database. This sandbox has no network egress
-- to Supabase (documented throughout audit/CURRENT_STATUS.md for every
-- prior session on this project). Review this file, then run it yourself
-- in the Supabase SQL Editor when ready — same handoff pattern already
-- used for migration 009.
--
-- Source: this schema follows audit/PHASE1_ARCHITECTURE_REVIEW_OMNICHANNEL.md
-- Section 8 ("Database Schema Proposal") as closely as possible, since that
-- proposal is the approved architecture, not a fresh design. Two deliberate
-- additions beyond Section 8's draft, called out explicitly because they
-- weren't in that proposal:
--
--   1. `properties` table — Section 8's draft has no explicit multi-property
--      table; BOOKMYSPACES_V3_MASTER_SPECIFICATION.md's "Multi Property
--      Support" section requires one ("No hardcoded properties. Everything
--      configurable."). Existing `packages.venue` is a free-text column
--      today ('monurama_rooftop', 'skyline', ...) — not touched here, but
--      now has a real table it could reference later if you choose to.
--
--   2. `room_types` generalized to `inventory_items` — Section 8 named this
--      table for hotel rooms specifically. The master spec's "Bookable
--      Inventory" section is explicit: "Do NOT design only for hotel
--      rooms... Rooms, Suites, Banquet Hall, Conference Hall, Rooftop,
--      Restaurant Event Area." Renamed and given an `inventory_type` column
--      so the same reservation logic works for all of those, per that
--      requirement. `rate_plans.room_type_id` in Section 8's draft is
--      `rate_plans.inventory_item_id` here for the same reason.
--
-- Everything else below matches Section 8's table list and column shapes
-- as written: customer_identities, channels, unified_conversations,
-- unified_conversation_channels, unified_messages, meal_plans, rate_plans,
-- addon_services, reservations, reservation_addons, settings, ai_prompts,
-- knowledge_sources, ai_interaction_log.
--
-- Open decision this migration takes a position on (per Section 8's own
-- flag: "highest-leverage schema choice in this whole proposal"):
-- `customer_id` columns below reference `leads(id)`, following Section 8's
-- *recommended default* (extend `leads` rather than a parallel `customers`
-- table) — not a final decision. If you decide differently, these FKs are
-- the only places that need to change.
-- ═══════════════════════════════════════════════════════════

-- ─────────────────────────────────────────
-- PROPERTIES
-- Multi-property foundation. Skyline Serenity / Monurama Homestay today,
-- future properties are rows, not code changes.
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS properties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,           -- e.g. 'skyline-serenity', 'monurama-homestay' — stable key for code/config references
  address TEXT,
  city TEXT,
  gst_number TEXT,
  google_maps_url TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  amenities TEXT[] DEFAULT '{}',
  images TEXT[] DEFAULT '{}',
  policies TEXT,                       -- free text today; can move to structured JSONB later if a real UI needs it
  business_hours JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_properties_slug ON properties(slug);
CREATE INDEX IF NOT EXISTS idx_properties_is_active ON properties(is_active);

DROP TRIGGER IF EXISTS update_properties_updated_at ON properties;
CREATE TRIGGER update_properties_updated_at
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "properties_service_role_all" ON properties;
CREATE POLICY "properties_service_role_all" ON properties
  FOR ALL USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────
-- CUSTOMER_IDENTITIES
-- Identity resolution — matches src/lib/identity/resolve-identity.ts's
-- current phone/email resolution; this table gives that same resolution a
-- durable, queryable record instead of resolving fresh from leads columns
-- every time. Not yet wired into resolve-identity.ts (that would mean a
-- live-DB-verified migration first) — schema only, for now.
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_identities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  customer_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  identity_type TEXT NOT NULL CHECK (identity_type IN ('phone', 'email', 'whatsapp_id', 'facebook_psid', 'instagram_igsid')),
  identity_value TEXT NOT NULL,
  verified BOOLEAN DEFAULT FALSE,

  UNIQUE(identity_type, identity_value)
);

CREATE INDEX IF NOT EXISTS idx_customer_identities_customer_id ON customer_identities(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_identities_value ON customer_identities(identity_type, identity_value);

ALTER TABLE customer_identities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customer_identities_service_role_all" ON customer_identities;
CREATE POLICY "customer_identities_service_role_all" ON customer_identities
  FOR ALL USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────
-- CHANNELS
-- Configured messaging/marketing channels — what src/lib/providers/types.ts's
-- MessagingChannel type will eventually be backed by at runtime.
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  channel_type TEXT NOT NULL CHECK (channel_type IN ('whatsapp', 'website_chat', 'facebook', 'instagram', 'email', 'sms', 'google_business', 'linkedin')),
  display_name TEXT NOT NULL,
  config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE
);

ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "channels_service_role_all" ON channels;
CREATE POLICY "channels_service_role_all" ON channels
  FOR ALL USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────
-- UNIFIED_CONVERSATIONS / UNIFIED_CONVERSATION_CHANNELS / UNIFIED_MESSAGES
-- The Unified Conversation Service's storage layer. Existing `conversations`
-- (website chat) and `whatsapp_conversations`/`whatsapp_messages` tables are
-- UNCHANGED and keep working — per the architecture review's migration
-- strategy (Section 14), those get backfilled into this schema and migrated
-- one feature at a time, not cut over in one step.
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS unified_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  customer_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'escalated')),
  assigned_to UUID,                    -- references auth.users, not enforced here (matches house style elsewhere — no FK to auth.users in this codebase's existing migrations)
  ai_active BOOLEAN DEFAULT TRUE,
  last_message_at TIMESTAMPTZ,
  first_touch_channel_id UUID REFERENCES channels(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_unified_conversations_customer_id ON unified_conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_unified_conversations_status ON unified_conversations(status);
CREATE INDEX IF NOT EXISTS idx_unified_conversations_last_message_at ON unified_conversations(last_message_at DESC);

ALTER TABLE unified_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "unified_conversations_service_role_all" ON unified_conversations;
CREATE POLICY "unified_conversations_service_role_all" ON unified_conversations
  FOR ALL USING (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS unified_conversation_channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  conversation_id UUID NOT NULL REFERENCES unified_conversations(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  channel_identity TEXT NOT NULL,      -- the channel-native id: phone, PSID, session id, email address
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_unified_conv_channels_conversation_id ON unified_conversation_channels(conversation_id);
CREATE INDEX IF NOT EXISTS idx_unified_conv_channels_identity ON unified_conversation_channels(channel_id, channel_identity);

ALTER TABLE unified_conversation_channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "unified_conversation_channels_service_role_all" ON unified_conversation_channels;
CREATE POLICY "unified_conversation_channels_service_role_all" ON unified_conversation_channels
  FOR ALL USING (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS unified_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  conversation_id UUID NOT NULL REFERENCES unified_conversations(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'ai', 'human')),

  content TEXT,
  raw_payload JSONB,
  external_message_id TEXT,
  ai_confidence NUMERIC(4,3)           -- 0.000–1.000, matches AICompletionResult.confidence in src/lib/providers/types.ts
);

CREATE INDEX IF NOT EXISTS idx_unified_messages_conversation_id ON unified_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_unified_messages_external_id ON unified_messages(external_message_id);

ALTER TABLE unified_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "unified_messages_service_role_all" ON unified_messages;
CREATE POLICY "unified_messages_service_role_all" ON unified_messages
  FOR ALL USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────
-- INVENTORY_ITEMS
-- Named `room_types` in the architecture review's draft; generalized here —
-- see file header. Belongs to a property; covers rooms, suites, banquet
-- hall, conference hall, rooftop, restaurant event area, etc.
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  inventory_type TEXT NOT NULL CHECK (inventory_type IN (
    'room', 'suite', 'apartment', 'banquet_hall', 'conference_hall',
    'rooftop', 'restaurant_event_area', 'wedding_venue', 'birthday_venue', 'meeting_room'
  )),
  name TEXT NOT NULL,
  description TEXT,
  max_occupancy INTEGER,
  base_capacity INTEGER,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_property_id ON inventory_items(property_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_type ON inventory_items(inventory_type);

DROP TRIGGER IF EXISTS update_inventory_items_updated_at ON inventory_items;
CREATE TRIGGER update_inventory_items_updated_at
  BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inventory_items_service_role_all" ON inventory_items;
CREATE POLICY "inventory_items_service_role_all" ON inventory_items
  FOR ALL USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────
-- MEAL_PLANS
-- Room Only / Breakfast / MAP / AP — admin-configurable per property.
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meal_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  code TEXT NOT NULL CHECK (code IN ('room_only', 'breakfast', 'map', 'ap')),
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,

  UNIQUE(property_id, code)
);

ALTER TABLE meal_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "meal_plans_service_role_all" ON meal_plans;
CREATE POLICY "meal_plans_service_role_all" ON meal_plans
  FOR ALL USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────
-- RATE_PLANS (pricing engine foundation)
-- `priority` resolves conflicts when multiple rate_plans overlap a date —
-- highest priority wins. Never hardcode pricing in application code; this
-- table is the single source of truth for it.
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  rate_type TEXT NOT NULL CHECK (rate_type IN (
    'base', 'weekend', 'seasonal', 'festival', 'holiday', 'corporate', 'ota', 'promotional'
  )),
  start_date DATE,
  end_date DATE,
  price NUMERIC(10,2) NOT NULL,
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,

  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_rate_plans_inventory_item_id ON rate_plans(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_rate_plans_date_range ON rate_plans(start_date, end_date);

DROP TRIGGER IF EXISTS update_rate_plans_updated_at ON rate_plans;
CREATE TRIGGER update_rate_plans_updated_at
  BEFORE UPDATE ON rate_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE rate_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rate_plans_service_role_all" ON rate_plans;
CREATE POLICY "rate_plans_service_role_all" ON rate_plans
  FOR ALL USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────
-- ADDON_SERVICES
-- Extra Bed, Airport Pickup/Drop, Decoration, Photography, etc. —
-- admin-configurable, per property (not global, since pricing differs).
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS addon_services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_addon_services_property_id ON addon_services(property_id);

ALTER TABLE addon_services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "addon_services_service_role_all" ON addon_services;
CREATE POLICY "addon_services_service_role_all" ON addon_services
  FOR ALL USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────
-- RESERVATIONS (first-class module, per master spec — not mixed with
-- `leads` or the existing banquet-shaped `bookings` table)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  customer_id UUID REFERENCES leads(id) ON DELETE SET NULL,

  guest_name TEXT NOT NULL,
  guest_mobile TEXT,
  guest_email TEXT,
  guest_address TEXT,
  guest_id_proof TEXT,
  guest_nationality TEXT,

  property_id UUID NOT NULL REFERENCES properties(id),
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
  room_count INTEGER DEFAULT 1,

  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  nights INTEGER GENERATED ALWAYS AS (check_out_date - check_in_date) STORED,
  adults INTEGER DEFAULT 1,
  children INTEGER DEFAULT 0,

  booking_source TEXT DEFAULT 'direct' CHECK (booking_source IN (
    'direct', 'website', 'whatsapp', 'phone', 'walk_in', 'referral',
    'booking_com', 'agoda', 'expedia', 'airbnb', 'other'
  )),
  status TEXT NOT NULL DEFAULT 'inquiry' CHECK (status IN (
    'inquiry', 'tentative', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'
  )),

  base_room_rate NUMERIC(10,2) DEFAULT 0,
  discount_amount NUMERIC(10,2) DEFAULT 0,
  final_room_rate NUMERIC(10,2) DEFAULT 0,
  meal_plan_id UUID REFERENCES meal_plans(id),
  meal_plan_charge NUMERIC(10,2) DEFAULT 0,

  special_requests TEXT,

  proposal_id UUID REFERENCES proposals(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,

  CHECK (check_out_date > check_in_date)
);

CREATE INDEX IF NOT EXISTS idx_reservations_customer_id ON reservations(customer_id);
CREATE INDEX IF NOT EXISTS idx_reservations_property_id ON reservations(property_id);
CREATE INDEX IF NOT EXISTS idx_reservations_inventory_item_id ON reservations(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_dates ON reservations(check_in_date, check_out_date);

DROP TRIGGER IF EXISTS update_reservations_updated_at ON reservations;
CREATE TRIGGER update_reservations_updated_at
  BEFORE UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reservations_service_role_all" ON reservations;
CREATE POLICY "reservations_service_role_all" ON reservations
  FOR ALL USING (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS reservation_addons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  addon_service_id UUID NOT NULL REFERENCES addon_services(id),
  quantity INTEGER DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL,
  total_price NUMERIC(10,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reservation_addons_reservation_id ON reservation_addons(reservation_id);

ALTER TABLE reservation_addons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reservation_addons_service_role_all" ON reservation_addons;
CREATE POLICY "reservation_addons_service_role_all" ON reservation_addons
  FOR ALL USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────
-- SETTINGS
-- Replaces the Settings page's current localStorage-only persistence
-- (audit/PHASE1_ARCHITECTURE_REVIEW_OMNICHANNEL.md Section 1). Schema only
-- here — wiring /api/settings to actually read/write this table is
-- follow-up API work, not part of this migration.
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  category TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  updated_by TEXT,

  UNIQUE(category, key)
);

DROP TRIGGER IF EXISTS update_settings_updated_at ON settings;
CREATE TRIGGER update_settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settings_service_role_all" ON settings;
CREATE POLICY "settings_service_role_all" ON settings
  FOR ALL USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────
-- AI_PROMPTS
-- Replaces the hardcoded SYSTEM_PROMPT constant in src/lib/ai.ts (not
-- edited in this migration — wiring is follow-up work, same as settings).
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_prompts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  name TEXT NOT NULL,
  prompt_template TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_ai_prompts_name_active ON ai_prompts(name, is_active);

ALTER TABLE ai_prompts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_prompts_service_role_all" ON ai_prompts;
CREATE POLICY "ai_prompts_service_role_all" ON ai_prompts
  FOR ALL USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────
-- KNOWLEDGE_SOURCES
-- Structured/curated knowledge entries with a real embedding column, for the
-- AI Orchestrator's vector retrieval. Distinct from the existing
-- `knowledge_chunks` table (document-derived content) per Section 8 — that
-- table is untouched.
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  category TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(1536),
  is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_knowledge_sources_category ON knowledge_sources(category);

-- Vector similarity index — without this, similarity search on `embedding`
-- is a full table scan, which defeats the point of using pgvector here.
-- Same index type/ops as the existing knowledge_chunks.embedding column
-- (see migrations/001_initial_schema.sql:175-176), found missing during the
-- Day 2 database review. Caught before this migration is ever applied, so
-- fixed in place rather than added as a follow-up migration.
CREATE INDEX IF NOT EXISTS idx_knowledge_sources_embedding
  ON knowledge_sources USING hnsw (embedding vector_cosine_ops);

DROP TRIGGER IF EXISTS update_knowledge_sources_updated_at ON knowledge_sources;
CREATE TRIGGER update_knowledge_sources_updated_at
  BEFORE UPDATE ON knowledge_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "knowledge_sources_service_role_all" ON knowledge_sources;
CREATE POLICY "knowledge_sources_service_role_all" ON knowledge_sources
  FOR ALL USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────
-- AI_INTERACTION_LOG
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_interaction_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  conversation_id UUID REFERENCES unified_conversations(id) ON DELETE SET NULL,
  confidence_score NUMERIC(4,3),
  escalated BOOLEAN DEFAULT FALSE,
  escalation_reason TEXT,
  response_time_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_ai_interaction_log_conversation_id ON ai_interaction_log(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_interaction_log_escalated ON ai_interaction_log(escalated);

ALTER TABLE ai_interaction_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_interaction_log_service_role_all" ON ai_interaction_log;
CREATE POLICY "ai_interaction_log_service_role_all" ON ai_interaction_log
  FOR ALL USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────
-- SEED: the two known properties, so this migration is immediately usable
-- rather than leaving `properties` empty. Slugs match what
-- src/types/reservation.ts's PropertySlug type expects.
-- ─────────────────────────────────────────
INSERT INTO properties (name, slug, is_active)
VALUES
  ('Skyline Serenity', 'skyline-serenity', TRUE),
  ('Monurama Homestay', 'monurama-homestay', TRUE)
ON CONFLICT (slug) DO NOTHING;
