-- ═══════════════════════════════════════════════════════════════════════════
-- BOOKMYSPACES V3 — STAGING SEED DATA
--
-- Realistic sample data for staging/UAT, NOT for production. Run only after
-- migrations 012 + 013 (and, if in scope, 004) are applied — this seed
-- depends on tables from all of them. Uses fixed UUIDs throughout (rather
-- than uuid_generate_v4()) purely so every INSERT below can reference an
-- earlier row directly, without psql-specific \gset tricks — safe to paste
-- into the Supabase SQL Editor as one script, or run via `psql -f`.
--
-- Idempotency: every INSERT uses ON CONFLICT DO NOTHING keyed on the fixed
-- UUID (primary key) or another natural unique key, so re-running this
-- script is safe and won't create duplicates.
--
-- Covers, per PRODUCTION readiness's request: repeat guests, a cancelled
-- booking, a corporate booking, a walk-in, a family stay, an event booking,
-- airport pickup (add-on), partial payments, and a refund scenario
-- (documented as a negative payment row — see the note at PAY-006 below,
-- since there is no dedicated refunds table in the current schema).
--
-- Uses the two real seeded properties from migration 012
-- (skyline-serenity, monurama-homestay) — does not create new properties.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. INVENTORY ITEMS (room types) — per property
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO inventory_items (id, property_id, inventory_type, name, description, max_occupancy, base_capacity, is_active)
SELECT * FROM (VALUES
  ('a0000000-0000-0000-0000-000000000001'::uuid, (SELECT id FROM properties WHERE slug = 'skyline-serenity'), 'room', 'Deluxe Room', 'City-view double room, queen bed', 3, 2, true),
  ('a0000000-0000-0000-0000-000000000002'::uuid, (SELECT id FROM properties WHERE slug = 'skyline-serenity'), 'suite', 'Executive Suite', 'Separate living area, king bed', 4, 2, true),
  ('a0000000-0000-0000-0000-000000000003'::uuid, (SELECT id FROM properties WHERE slug = 'skyline-serenity'), 'banquet_hall', 'Grand Banquet Hall', 'Up to 300 guests, stage + AV included', 300, 150, true),
  ('a0000000-0000-0000-0000-000000000004'::uuid, (SELECT id FROM properties WHERE slug = 'monurama-homestay'), 'room', 'Garden Room', 'Ground-floor room with garden access', 2, 2, true),
  ('a0000000-0000-0000-0000-000000000005'::uuid, (SELECT id FROM properties WHERE slug = 'monurama-homestay'), 'apartment', 'Family Apartment', 'Two-bedroom, kitchenette, sleeps 5', 5, 4, true)
) AS v(id, property_id, inventory_type, name, description, max_occupancy, base_capacity, is_active)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. MEAL PLANS — per property
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO meal_plans (id, property_id, code, name, description, price, is_active)
SELECT * FROM (VALUES
  ('b0000000-0000-0000-0000-000000000001'::uuid, (SELECT id FROM properties WHERE slug = 'skyline-serenity'), 'room_only', 'Room Only', 'No meals included', 0, true),
  ('b0000000-0000-0000-0000-000000000002'::uuid, (SELECT id FROM properties WHERE slug = 'skyline-serenity'), 'breakfast', 'Breakfast Included', 'Complimentary buffet breakfast', 400, true),
  ('b0000000-0000-0000-0000-000000000003'::uuid, (SELECT id FROM properties WHERE slug = 'skyline-serenity'), 'map', 'Modified American Plan', 'Breakfast + one more meal', 900, true),
  ('b0000000-0000-0000-0000-000000000004'::uuid, (SELECT id FROM properties WHERE slug = 'monurama-homestay'), 'room_only', 'Room Only', 'No meals included', 0, true),
  ('b0000000-0000-0000-0000-000000000005'::uuid, (SELECT id FROM properties WHERE slug = 'monurama-homestay'), 'breakfast', 'Home-style Breakfast', 'Bengali breakfast included', 300, true)
) AS v(id, property_id, code, name, description, price, is_active)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. RATE PLANS — base rate for each room type (no date range = always applies)
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO rate_plans (id, inventory_item_id, rate_type, start_date, end_date, price, priority, is_active)
SELECT * FROM (VALUES
  ('c0000000-0000-0000-0000-000000000001'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'base', NULL::date, NULL::date, 3500, 0, true),
  ('c0000000-0000-0000-0000-000000000002'::uuid, 'a0000000-0000-0000-0000-000000000002'::uuid, 'base', NULL::date, NULL::date, 6500, 0, true),
  ('c0000000-0000-0000-0000-000000000003'::uuid, 'a0000000-0000-0000-0000-000000000003'::uuid, 'base', NULL::date, NULL::date, 75000, 0, true),
  ('c0000000-0000-0000-0000-000000000004'::uuid, 'a0000000-0000-0000-0000-000000000004'::uuid, 'base', NULL::date, NULL::date, 2200, 0, true),
  ('c0000000-0000-0000-0000-000000000005'::uuid, 'a0000000-0000-0000-0000-000000000005'::uuid, 'base', NULL::date, NULL::date, 4500, 0, true),
  -- Weekend uplift on the Deluxe Room, higher priority so it wins over base on Fri/Sat nights
  ('c0000000-0000-0000-0000-000000000006'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'weekend', NULL::date, NULL::date, 4200, 10, true),
  -- Corporate rate on the Executive Suite (lower than rack rate, used by CORP-001 below)
  ('c0000000-0000-0000-0000-000000000007'::uuid, 'a0000000-0000-0000-0000-000000000002'::uuid, 'corporate', NULL::date, NULL::date, 5800, 5, true)
) AS v(id, inventory_item_id, rate_type, start_date, end_date, price, priority, is_active)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. ADD-ON SERVICES — per property
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO addon_services (id, property_id, name, category, price, is_active)
SELECT * FROM (VALUES
  ('d0000000-0000-0000-0000-000000000001'::uuid, (SELECT id FROM properties WHERE slug = 'skyline-serenity'), 'Airport Pickup', 'transport', 1200, true),
  ('d0000000-0000-0000-0000-000000000002'::uuid, (SELECT id FROM properties WHERE slug = 'skyline-serenity'), 'Extra Bed', 'room', 800, true),
  ('d0000000-0000-0000-0000-000000000003'::uuid, (SELECT id FROM properties WHERE slug = 'skyline-serenity'), 'Event Decoration (Standard)', 'event', 25000, true),
  ('d0000000-0000-0000-0000-000000000004'::uuid, (SELECT id FROM properties WHERE slug = 'skyline-serenity'), 'Photography (4 hours)', 'event', 15000, true),
  ('d0000000-0000-0000-0000-000000000005'::uuid, (SELECT id FROM properties WHERE slug = 'monurama-homestay'), 'Airport Pickup', 'transport', 900, true),
  ('d0000000-0000-0000-0000-000000000006'::uuid, (SELECT id FROM properties WHERE slug = 'monurama-homestay'), 'Extra Bed', 'room', 600, true)
) AS v(id, property_id, name, category, price, is_active)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. LEADS / CUSTOMERS — covering the requested scenarios
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO leads (id, name, phone, email, event_type, event_date, guest_count, budget, special_requirements, venue, status, source, assigned_to, notes)
SELECT * FROM (VALUES
  -- Repeat guest (2 stays — see reservations REPEAT-001a/REPEAT-001b below)
  ('e0000000-0000-0000-0000-000000000001'::uuid, 'Ananya Sengupta', '919830012345', 'ananya.sengupta@example.com', 'leisure_stay', '2026-08-10'::date, 2, '15000-25000', 'Late check-in requested', 'skyline', 'confirmed', 'website', 'Priya', 'Third-time guest, prefers Deluxe Room with city view'),
  -- Cancelled booking
  ('e0000000-0000-0000-0000-000000000002'::uuid, 'Rohit Malhotra', '919830023456', 'rohit.m@example.com', 'leisure_stay', '2026-09-05'::date, 2, '10000-15000', NULL, 'skyline', 'rejected', 'whatsapp', 'Priya', 'Cancelled due to travel plan change — see CANCEL-001'),
  -- Corporate booking
  ('e0000000-0000-0000-0000-000000000003'::uuid, 'Debashish Roy (Techvantage Pvt Ltd)', '919830034567', 'debashish.roy@techvantage.example.com', 'corporate_stay', '2026-08-20'::date, 4, '50000+', 'GST invoice required, company billing', 'skyline', 'confirmed', 'referral', 'Anirban', 'Corporate account — quarterly training batches, negotiated rate'),
  -- Walk-in
  ('e0000000-0000-0000-0000-000000000004'::uuid, 'Walk-in — Suresh Yadav', '919830045678', NULL, 'leisure_stay', '2026-07-15'::date, 1, NULL, NULL, 'monurama', 'confirmed', 'other', 'Priya', 'Walk-in, paid cash on arrival'),
  -- Family stay
  ('e0000000-0000-0000-0000-000000000005'::uuid, 'Sharmistha Banerjee', '919830056789', 'sharmistha.b@example.com', 'family_stay', '2026-10-02'::date, 5, '20000-30000', 'Connecting rooms if possible, kids aged 6 and 9', 'monurama', 'confirmed', 'website', 'Priya', 'Durga Puja family trip, booked Family Apartment'),
  -- Event booking (wedding)
  ('e0000000-0000-0000-0000-000000000006'::uuid, 'Arindam & Poulami (Wedding)', '919830067890', 'arindam.sarkar@example.com', 'wedding', '2026-11-20'::date, 250, '250000+', 'Stage decoration, live catering counters', 'skyline', 'confirmed', 'instagram', 'Anirban', 'Banquet hall full-day booking, decoration + photography add-ons'),
  -- Airport pickup scenario (leisure guest who added the add-on)
  ('e0000000-0000-0000-0000-000000000007'::uuid, 'Kabir Ahmed', '919830078901', 'kabir.ahmed@example.com', 'leisure_stay', '2026-08-05'::date, 2, '10000-15000', 'Arriving on a 6am flight', 'skyline', 'confirmed', 'website', 'Priya', 'Requested airport pickup — add-on booked'),
  -- Partial payment, balance still due
  ('e0000000-0000-0000-0000-000000000008'::uuid, 'Meera Krishnan', '919830089012', 'meera.k@example.com', 'leisure_stay', '2026-09-15'::date, 2, '10000-15000', NULL, 'skyline', 'confirmed', 'justdial', 'Priya', 'Paid 50% advance, balance due at check-in'),
  -- Refund scenario
  ('e0000000-0000-0000-0000-000000000009'::uuid, 'Tanvir Hossain', '919830090123', 'tanvir.h@example.com', 'leisure_stay', '2026-07-25'::date, 2, '10000-15000', NULL, 'monurama', 'rejected', 'website', 'Priya', 'Partial refund issued after date change made stay shorter — see PAY-006'),
  -- Second visit for the repeat guest above (same phone number — Identity Resolution should match)
  ('e0000000-0000-0000-0000-000000000010'::uuid, 'Ananya Sengupta', '919830012345', 'ananya.sengupta@example.com', 'leisure_stay', '2026-11-01'::date, 2, '15000-25000', NULL, 'skyline', 'confirmed', 'whatsapp', 'Priya', 'Fourth-time guest — same phone as e0000000-...0001, tests Identity Resolution')
) AS v(id, name, phone, email, event_type, event_date, guest_count, budget, special_requirements, venue, status, source, assigned_to, notes)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. RESERVATIONS
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO reservations (id, customer_id, guest_name, guest_mobile, guest_email, property_id, inventory_item_id, room_count, check_in_date, check_out_date, adults, children, booking_source, status, base_room_rate, discount_amount, final_room_rate, meal_plan_id, meal_plan_charge, special_requests)
SELECT * FROM (VALUES
  -- REPEAT-001a: Ananya's first stay in this seed, already checked out
  ('f0000000-0000-0000-0000-000000000001'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid, 'Ananya Sengupta', '919830012345', 'ananya.sengupta@example.com',
   (SELECT id FROM properties WHERE slug = 'skyline-serenity'), 'a0000000-0000-0000-0000-000000000001'::uuid, 1, '2026-08-10'::date, '2026-08-12'::date, 2, 0, 'website', 'checked_out', 3500, 0, 3500, 'b0000000-0000-0000-0000-000000000002'::uuid, 400, 'Late check-in requested'),
  -- REPEAT-001b: Ananya's second stay (upcoming, confirmed) — tests repeat-guest history on Customer Profile
  ('f0000000-0000-0000-0000-000000000002'::uuid, 'e0000000-0000-0000-0000-000000000010'::uuid, 'Ananya Sengupta', '919830012345', 'ananya.sengupta@example.com',
   (SELECT id FROM properties WHERE slug = 'skyline-serenity'), 'a0000000-0000-0000-0000-000000000001'::uuid, 1, '2026-11-01'::date, '2026-11-03'::date, 2, 0, 'whatsapp', 'confirmed', 3500, 0, 3500, 'b0000000-0000-0000-0000-000000000002'::uuid, 400, NULL),
  -- CANCEL-001: cancelled booking
  ('f0000000-0000-0000-0000-000000000003'::uuid, 'e0000000-0000-0000-0000-000000000002'::uuid, 'Rohit Malhotra', '919830023456', 'rohit.m@example.com',
   (SELECT id FROM properties WHERE slug = 'skyline-serenity'), 'a0000000-0000-0000-0000-000000000001'::uuid, 1, '2026-09-05'::date, '2026-09-07'::date, 2, 0, 'whatsapp', 'cancelled', 3500, 0, 3500, 'b0000000-0000-0000-0000-000000000001'::uuid, 0, NULL),
  -- CORP-001: corporate booking, 2 rooms via 2 adults per suite, negotiated rate reflected in final_room_rate
  ('f0000000-0000-0000-0000-000000000004'::uuid, 'e0000000-0000-0000-0000-000000000003'::uuid, 'Debashish Roy (Techvantage Pvt Ltd)', '919830034567', 'debashish.roy@techvantage.example.com',
   (SELECT id FROM properties WHERE slug = 'skyline-serenity'), 'a0000000-0000-0000-0000-000000000002'::uuid, 1, '2026-08-20'::date, '2026-08-23'::date, 2, 0, 'referral', 'confirmed', 6500, 700, 5800, 'b0000000-0000-0000-0000-000000000003'::uuid, 900, 'GST invoice required, company billing'),
  -- WALKIN-001: walk-in, single night, room only
  ('f0000000-0000-0000-0000-000000000005'::uuid, 'e0000000-0000-0000-0000-000000000004'::uuid, 'Suresh Yadav', '919830045678', NULL,
   (SELECT id FROM properties WHERE slug = 'monurama-homestay'), 'a0000000-0000-0000-0000-000000000004'::uuid, 1, '2026-07-15'::date, '2026-07-16'::date, 1, 0, 'walk_in', 'checked_out', 2200, 0, 2200, 'b0000000-0000-0000-0000-000000000004'::uuid, 0, NULL),
  -- FAMILY-001: family stay in the Family Apartment
  ('f0000000-0000-0000-0000-000000000006'::uuid, 'e0000000-0000-0000-0000-000000000005'::uuid, 'Sharmistha Banerjee', '919830056789', 'sharmistha.b@example.com',
   (SELECT id FROM properties WHERE slug = 'monurama-homestay'), 'a0000000-0000-0000-0000-000000000005'::uuid, 1, '2026-10-02'::date, '2026-10-06'::date, 2, 2, 'website', 'confirmed', 4500, 0, 4500, 'b0000000-0000-0000-0000-000000000005'::uuid, 300, 'Kids aged 6 and 9, connecting rooms if possible'),
  -- EVENT-001: wedding, banquet hall, full day (check_out next day for the generated `nights` column to compute; event is really a single-day function)
  ('f0000000-0000-0000-0000-000000000007'::uuid, 'e0000000-0000-0000-0000-000000000006'::uuid, 'Arindam & Poulami (Wedding)', '919830067890', 'arindam.sarkar@example.com',
   (SELECT id FROM properties WHERE slug = 'skyline-serenity'), 'a0000000-0000-0000-0000-000000000003'::uuid, 1, '2026-11-20'::date, '2026-11-21'::date, 2, 0, 'instagram', 'confirmed', 75000, 5000, 70000, 'b0000000-0000-0000-0000-000000000001'::uuid, 0, 'Stage decoration, live catering counters, 250 guests'),
  -- PICKUP-001: leisure stay with airport pickup add-on (reservation_addons row below)
  ('f0000000-0000-0000-0000-000000000008'::uuid, 'e0000000-0000-0000-0000-000000000007'::uuid, 'Kabir Ahmed', '919830078901', 'kabir.ahmed@example.com',
   (SELECT id FROM properties WHERE slug = 'skyline-serenity'), 'a0000000-0000-0000-0000-000000000001'::uuid, 1, '2026-08-05'::date, '2026-08-07'::date, 2, 0, 'website', 'confirmed', 3500, 0, 3500, 'b0000000-0000-0000-0000-000000000001'::uuid, 0, 'Arriving on a 6am flight — airport pickup booked'),
  -- PARTIAL-001: partial payment scenario
  ('f0000000-0000-0000-0000-000000000009'::uuid, 'e0000000-0000-0000-0000-000000000008'::uuid, 'Meera Krishnan', '919830089012', 'meera.k@example.com',
   (SELECT id FROM properties WHERE slug = 'skyline-serenity'), 'a0000000-0000-0000-0000-000000000002'::uuid, 1, '2026-09-15'::date, '2026-09-18'::date, 2, 0, 'booking_com', 'tentative', 6500, 0, 6500, 'b0000000-0000-0000-0000-000000000001'::uuid, 0, NULL),
  -- REFUND-001: shortened stay, refund issued
  ('f0000000-0000-0000-0000-000000000010'::uuid, 'e0000000-0000-0000-0000-000000000009'::uuid, 'Tanvir Hossain', '919830090123', 'tanvir.h@example.com',
   (SELECT id FROM properties WHERE slug = 'monurama-homestay'), 'a0000000-0000-0000-0000-000000000004'::uuid, 1, '2026-07-25'::date, '2026-07-26'::date, 2, 0, 'website', 'cancelled', 2200, 0, 2200, 'b0000000-0000-0000-0000-000000000004'::uuid, 0, 'Originally booked 3 nights, shortened to 1, remainder refunded')
) AS v(id, customer_id, guest_name, guest_mobile, guest_email, property_id, inventory_item_id, room_count, check_in_date, check_out_date, adults, children, booking_source, status, base_room_rate, discount_amount, final_room_rate, meal_plan_id, meal_plan_charge, special_requests)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. RESERVATION ADD-ONS — airport pickup on PICKUP-001, decoration+photography on EVENT-001
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO reservation_addons (id, reservation_id, addon_service_id, quantity, unit_price, total_price)
SELECT * FROM (VALUES
  ('11100000-0000-0000-0000-000000000001'::uuid, 'f0000000-0000-0000-0000-000000000008'::uuid, 'd0000000-0000-0000-0000-000000000001'::uuid, 1, 1200::numeric, 1200::numeric),
  ('11100000-0000-0000-0000-000000000002'::uuid, 'f0000000-0000-0000-0000-000000000007'::uuid, 'd0000000-0000-0000-0000-000000000003'::uuid, 1, 25000::numeric, 25000::numeric),
  ('11100000-0000-0000-0000-000000000003'::uuid, 'f0000000-0000-0000-0000-000000000007'::uuid, 'd0000000-0000-0000-0000-000000000004'::uuid, 1, 15000::numeric, 15000::numeric)
) AS v(id, reservation_id, addon_service_id, quantity, unit_price, total_price)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 8. PROPOSALS — generated for the corporate booking, the wedding, and the
--    partial-payment guest (three different points in the proposal lifecycle)
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO proposals (id, lead_id, proposal_number, client_name, client_phone, client_email, event_type, event_date, guest_count, venue, package_name, base_price, addons, discount_amount, total_price, status, sent_at, accepted_at, property_id, inventory_item_id, reservation_id)
SELECT * FROM (VALUES
  ('22200000-0000-0000-0000-000000000001'::uuid, 'e0000000-0000-0000-0000-000000000003'::uuid, 'BMS-2026-101', 'Debashish Roy (Techvantage Pvt Ltd)', '919830034567', 'debashish.roy@techvantage.example.com',
   'corporate_stay', '2026-08-20'::date, 2, 'skyline', 'Corporate — Executive Suite x3 nights', 6500::numeric, '[]'::jsonb, 700::numeric, 20100::numeric, 'accepted',
   '2026-07-10 10:00:00+05:30'::timestamptz, '2026-07-11 09:30:00+05:30'::timestamptz,
   (SELECT id FROM properties WHERE slug = 'skyline-serenity'), 'a0000000-0000-0000-0000-000000000002'::uuid, 'f0000000-0000-0000-0000-000000000004'::uuid),
  ('22200000-0000-0000-0000-000000000002'::uuid, 'e0000000-0000-0000-0000-000000000006'::uuid, 'BMS-2026-102', 'Arindam & Poulami (Wedding)', '919830067890', 'arindam.sarkar@example.com',
   'wedding', '2026-11-20'::date, 250, 'skyline', 'Wedding — Grand Banquet Hall, Full Day', 75000::numeric,
   '[{"name":"Event Decoration (Standard)","price":25000},{"name":"Photography (4 hours)","price":15000}]'::jsonb,
   5000::numeric, 110000::numeric, 'accepted',
   '2026-06-01 11:00:00+05:30'::timestamptz, '2026-06-05 16:45:00+05:30'::timestamptz,
   (SELECT id FROM properties WHERE slug = 'skyline-serenity'), 'a0000000-0000-0000-0000-000000000003'::uuid, 'f0000000-0000-0000-0000-000000000007'::uuid),
  ('22200000-0000-0000-0000-000000000003'::uuid, 'e0000000-0000-0000-0000-000000000008'::uuid, 'BMS-2026-103', 'Meera Krishnan', '919830089012', 'meera.k@example.com',
   'leisure_stay', '2026-09-15'::date, 2, 'skyline', 'Executive Suite x3 nights', 6500::numeric, '[]'::jsonb, 0::numeric, 19500::numeric, 'sent',
   '2026-08-20 14:20:00+05:30'::timestamptz, NULL,
   (SELECT id FROM properties WHERE slug = 'skyline-serenity'), 'a0000000-0000-0000-0000-000000000002'::uuid, 'f0000000-0000-0000-0000-000000000009'::uuid)
) AS v(id, lead_id, proposal_number, client_name, client_phone, client_email, event_type, event_date, guest_count, venue, package_name, base_price, addons, discount_amount, total_price, status, sent_at, accepted_at, property_id, inventory_item_id, reservation_id)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 9. INVOICES — one per accepted/sent proposal (invoice_number assigned by
--    the existing DB trigger, not set here)
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO invoices (id, proposal_id, subtotal, discount_amount, tax_amount, total_amount, advance_received, balance_due, status)
SELECT * FROM (VALUES
  ('33300000-0000-0000-0000-000000000001'::uuid, '22200000-0000-0000-0000-000000000001'::uuid, 20800::numeric, 700::numeric, 0::numeric, 20100::numeric, 20100::numeric, 0::numeric, 'paid'),
  ('33300000-0000-0000-0000-000000000002'::uuid, '22200000-0000-0000-0000-000000000002'::uuid, 115000::numeric, 5000::numeric, 0::numeric, 110000::numeric, 55000::numeric, 55000::numeric, 'sent'),
  ('33300000-0000-0000-0000-000000000003'::uuid, '22200000-0000-0000-0000-000000000003'::uuid, 19500::numeric, 0::numeric, 0::numeric, 19500::numeric, 9750::numeric, 9750::numeric, 'sent')
) AS v(id, proposal_id, subtotal, discount_amount, tax_amount, total_amount, advance_received, balance_due, status)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 10. PAYMENTS — full settlement (corporate), one advance so far (wedding),
--     partial advance (Meera), and a refund (negative amount, see note)
-- ─────────────────────────────────────────────────────────────────────────

-- NOTE ON REFUNDS: this schema has no dedicated refunds table or a
-- payment_type value for "refund" enforced by a CHECK constraint (see
-- src/app/api/proposals/[id]/payment/route.ts — payment_type defaults to
-- 'advance' and is otherwise free-text). Until a real refunds feature
-- exists (see VERSION1_1_ROADMAP.md), the accepted convention for seed/UAT
-- purposes is a payment row with a negative amount and payment_type
-- 'refund', which nets correctly against advance_received wherever the app
-- sums payments (e.g. the invoice route's balance calculation). Confirm this
-- convention still matches production behaviour before relying on it beyond
-- staging — it has not been live-tested.

INSERT INTO payments (id, proposal_id, amount, payment_date, payment_mode, transaction_ref, notes, payment_type)
SELECT * FROM (VALUES
  -- CORP-001 (Techvantage): paid in full in two installments
  ('44400000-0000-0000-0000-000000000001'::uuid, '22200000-0000-0000-0000-000000000001'::uuid, 10000::numeric, '2026-07-11'::date, 'bank_transfer', 'NEFT-TV-98213', 'Advance on acceptance', 'advance'),
  ('44400000-0000-0000-0000-000000000002'::uuid, '22200000-0000-0000-0000-000000000001'::uuid, 10100::numeric, '2026-08-20'::date, 'bank_transfer', 'NEFT-TV-98544', 'Balance settled at check-in', 'balance'),
  -- EVENT-001 (Wedding): 50% advance only so far — balance still due (matches invoices row above)
  ('44400000-0000-0000-0000-000000000003'::uuid, '22200000-0000-0000-0000-000000000002'::uuid, 55000::numeric, '2026-06-05'::date, 'upi', 'UPI-WED-77210', '50% advance on booking confirmation', 'advance'),
  -- PARTIAL-001 (Meera Krishnan): 50% advance, balance due at check-in — this is the scenario
  -- this session's accepted_at fix (payment/route.ts) specifically protects: this payment should
  -- be reflected in the Revenue Dashboard's accepted-proposals total.
  ('44400000-0000-0000-0000-000000000004'::uuid, '22200000-0000-0000-0000-000000000003'::uuid, 9750::numeric, '2026-08-22'::date, 'upi', 'UPI-MK-33190', '50% advance', 'advance'),
  -- REFUND-001 (Tanvir Hossain, via a separate one-off proposal not otherwise seeded here):
  -- represented directly against CORP-001's proposal is wrong, so this refund references its own
  -- minimal proposal row created just for it, matching the negative-payment convention above.
  ('44400000-0000-0000-0000-000000000005'::uuid, '22200000-0000-0000-0000-000000000004'::uuid, 6600::numeric, '2026-07-20'::date, 'upi', 'UPI-TH-11002', 'Original 3-night advance payment', 'advance'),
  ('44400000-0000-0000-0000-000000000006'::uuid, '22200000-0000-0000-0000-000000000004'::uuid, -4400::numeric, '2026-07-24'::date, 'upi', 'UPI-TH-REFUND-11002', 'Refund for 2 shortened nights (stay reduced from 3 to 1 night)', 'refund')
) AS v(id, proposal_id, amount, payment_date, payment_mode, transaction_ref, notes, payment_type)
ON CONFLICT (id) DO NOTHING;

-- Minimal proposal + invoice for Tanvir Hossain's refund scenario (PAY-005/PAY-006 above
-- reference this proposal, not one of the three main proposals, so the refund is scoped to the
-- correct guest instead of incorrectly appearing against the corporate account).
INSERT INTO proposals (id, lead_id, proposal_number, client_name, client_phone, client_email, event_type, event_date, guest_count, venue, package_name, base_price, addons, discount_amount, total_price, status, sent_at, accepted_at, property_id, inventory_item_id, reservation_id)
SELECT * FROM (VALUES
  ('22200000-0000-0000-0000-000000000004'::uuid, 'e0000000-0000-0000-0000-000000000009'::uuid, 'BMS-2026-104', 'Tanvir Hossain', '919830090123', 'tanvir.h@example.com',
   'leisure_stay', '2026-07-25'::date, 2, 'monurama', 'Garden Room x1 night (originally 3)', 2200::numeric, '[]'::jsonb, 0::numeric, 2200::numeric, 'accepted',
   '2026-07-18 09:00:00+05:30'::timestamptz, '2026-07-19 12:00:00+05:30'::timestamptz,
   (SELECT id FROM properties WHERE slug = 'monurama-homestay'), 'a0000000-0000-0000-0000-000000000004'::uuid, 'f0000000-0000-0000-0000-000000000010'::uuid)
) AS v(id, lead_id, proposal_number, client_name, client_phone, client_email, event_type, event_date, guest_count, venue, package_name, base_price, addons, discount_amount, total_price, status, sent_at, accepted_at, property_id, inventory_item_id, reservation_id)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 11. TIMELINE EVENTS (activity_logs) — a representative trail per scenario.
--     Matches the exact action/description shape reservation-workflow.ts and
--     payment/route.ts already write in real code, so this seed data renders
--     correctly on the Customer Profile timeline without any code changes.
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO activity_logs (id, lead_id, action, description, performed_by, metadata)
SELECT * FROM (VALUES
  ('55500000-0000-0000-0000-000000000001'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid, 'reservation_created', 'Reservation created for 2026-08-10 -> 2026-08-12', 'system', '{"reservationId":"f0000000-0000-0000-0000-000000000001"}'::jsonb),
  ('55500000-0000-0000-0000-000000000002'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid, 'reservation_checked_in', 'Reservation f0000000-0000-0000-0000-000000000001 checked in', 'system', '{"reservationId":"f0000000-0000-0000-0000-000000000001"}'::jsonb),
  ('55500000-0000-0000-0000-000000000003'::uuid, 'e0000000-0000-0000-0000-000000000001'::uuid, 'reservation_checked_out', 'Reservation f0000000-0000-0000-0000-000000000001 checked out', 'system', '{"reservationId":"f0000000-0000-0000-0000-000000000001"}'::jsonb),
  ('55500000-0000-0000-0000-000000000004'::uuid, 'e0000000-0000-0000-0000-000000000002'::uuid, 'reservation_cancelled', 'Guest changed travel plans', 'system', '{"reservationId":"f0000000-0000-0000-0000-000000000003","reason":"Guest changed travel plans"}'::jsonb),
  ('55500000-0000-0000-0000-000000000005'::uuid, 'e0000000-0000-0000-0000-000000000003'::uuid, 'payment_recorded', 'Payment of ₹10,000 recorded for BMS-2026-101 (bank_transfer)', 'admin', '{}'::jsonb),
  ('55500000-0000-0000-0000-000000000006'::uuid, 'e0000000-0000-0000-0000-000000000003'::uuid, 'payment_recorded', 'Payment of ₹10,100 recorded for BMS-2026-101 (bank_transfer)', 'admin', '{}'::jsonb),
  ('55500000-0000-0000-0000-000000000007'::uuid, 'e0000000-0000-0000-0000-000000000006'::uuid, 'payment_recorded', 'Payment of ₹55,000 recorded for BMS-2026-102 (upi)', 'admin', '{}'::jsonb),
  ('55500000-0000-0000-0000-000000000008'::uuid, 'e0000000-0000-0000-0000-000000000008'::uuid, 'payment_recorded', 'Payment of ₹9,750 recorded for BMS-2026-103 (upi)', 'admin', '{}'::jsonb),
  ('55500000-0000-0000-0000-000000000009'::uuid, 'e0000000-0000-0000-0000-000000000009'::uuid, 'payment_recorded', 'Payment of ₹6,600 recorded for BMS-2026-104 (upi)', 'admin', '{}'::jsonb),
  ('55500000-0000-0000-0000-000000000010'::uuid, 'e0000000-0000-0000-0000-000000000009'::uuid, 'payment_recorded', 'Refund of ₹4,400 issued for BMS-2026-104 (upi) — stay shortened from 3 nights to 1', 'admin', '{}'::jsonb)
) AS v(id, lead_id, action, description, performed_by, metadata)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- Verification query — run after this script to confirm row counts
-- ─────────────────────────────────────────────────────────────────────────
-- select
--   (select count(*) from inventory_items where id::text like 'a0000000%')  as inventory_items,
--   (select count(*) from meal_plans      where id::text like 'b0000000%')  as meal_plans,
--   (select count(*) from rate_plans      where id::text like 'c0000000%')  as rate_plans,
--   (select count(*) from addon_services  where id::text like 'd0000000%')  as addon_services,
--   (select count(*) from leads           where id::text like 'e0000000%')  as leads,
--   (select count(*) from reservations    where id::text like 'f0000000%')  as reservations,
--   (select count(*) from reservation_addons where id::text like '11100000%') as reservation_addons,
--   (select count(*) from proposals       where id::text like '22200000%')  as proposals,
--   (select count(*) from invoices        where id::text like '33300000%')  as invoices,
--   (select count(*) from payments        where id::text like '44400000%')  as payments,
--   (select count(*) from activity_logs   where id::text like '55500000%')  as timeline_events;
-- Expected: 5, 5, 7, 6, 10, 10, 3, 4, 3, 6, 10
