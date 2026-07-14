# BookMySpaces V3 — User Acceptance Test Plan

Run this after migrations 012/013 (and 004, if in scope — see `PRODUCTION_DEPLOYMENT_GUIDE.md` §3a) are live and the app is deployed. Every scenario below should be walked through by hand, as a real hotel operator would, against real (or realistic test) data — this is the first genuine end-to-end validation this project will have had; every prior session's testing was static code review only, with no live database access.

For each scenario: perform the action, compare against Expected Behaviour, and mark Pass/Fail against the stated Pass Criteria. Log any failure with the exact step, screenshot if possible, and the actual vs. expected result — that becomes the first real, live-data bug report this project has ever had.

## Setup (once, before scenario 1)

- At least one property has real `inventory_items` and `rate_plans` — there is no admin UI for this yet, add them directly via Supabase Table Editor or SQL (`PRODUCTION_DEPLOYMENT_GUIDE.md` §7 has the smoke-test's throwaway example to copy the shape from).
- A test WhatsApp number you can send messages from, to exercise the enquiry channel for real.

## Scenario 1 — Customer Enquiry

**Steps:** Send a WhatsApp message to the business number from a test phone, as a prospective customer asking about availability.
**Expected:** Message appears in the Unified Conversations / CRM inbox within a few seconds; a new lead is created (or an existing one is matched — see Scenario 2) with the correct phone number and message content.
**Pass criteria:** Message visible in the CRM, correctly attributed to a lead record, no duplicate lead created for the same phone number.

## Scenario 2 — Identity Resolution

**Steps:** Send a second enquiry from the same test phone number, using a different channel if possible (e.g. the website chat widget) or simply a second WhatsApp message after some time has passed.
**Expected:** Both messages resolve to the same customer/lead record — no duplicate created for the same phone number across channels.
**Pass criteria:** One lead record, both messages/conversations visible on its timeline.

## Scenario 3 — Customer Search

**Steps:** From the CRM, search for the test customer by name and separately by phone number.
**Expected:** Both searches return the correct customer record; no false positives, no missing result.
**Pass criteria:** Correct record found by both search methods.

## Scenario 4 — Customer Profile

**Steps:** Open the customer's profile page.
**Expected:** Shows correct contact details, full conversation/message history, and (once later scenarios have run) reservation/proposal/payment history.
**Pass criteria:** All data accurate and complete; AI Operator Assistant panel loads (Customer Summary / Suggested Reply / Recommendations) without error.

## Scenario 5 — Reservation

**Steps:** From the Reservation Dashboard, create a new reservation for the test customer against the real inventory item set up above, for a real date range.
**Expected:** Reservation is created in `inquiry` status, visible on the dashboard and the Reservation Calendar for the correct dates.
**Pass criteria:** Reservation created successfully, correct guest/date/property/room details, appears on the Calendar.

## Scenario 6 — Availability

**Steps:** Attempt to create a second reservation for the same room with overlapping dates.
**Expected:** The system blocks it or clearly warns of the conflict — this is the exact check `smoke-test-v3.mjs` validated in isolation; this scenario is its live-data equivalent.
**Pass criteria:** Overlapping booking is prevented or flagged; a genuinely free date range for the same room succeeds normally.

## Scenario 7 — Pricing

**Steps:** Check the calculated price for the reservation created in Scenario 5.
**Expected:** Price matches the rate plan set up for that inventory item × number of nights, correctly.
**Pass criteria:** Displayed price is arithmetically correct against the real rate plan data.

## Scenario 8 — Proposal

**Steps:** From the Reservation Details screen, generate a proposal from the reservation.
**Expected:** A new proposal is created, linked to the reservation, with the correct customer/venue/pricing details carried over.
**Pass criteria:** Proposal created, `reservation_id` link correct (verifiable via the Proposals page showing the reservation reference), pricing matches Scenario 7.

## Scenario 9 — Proposal Conversion

**Steps:** Separately, take an existing proposal (not tied to a reservation) and use "Convert to Reservation."
**Expected:** A new reservation is created from the proposal, correctly populated.
**Pass criteria:** Reservation created with matching customer/date/venue details; both directions of the proposal↔reservation link work (Scenario 8 tests reservation→proposal, this tests proposal→reservation).

## Scenario 10 — Invoice

**Steps:** Open Financial Documents → Latest Invoice for the proposal from Scenario 8 or 9.
**Expected:** A correctly formatted invoice generates, with accurate line items, totals, and (initially) a zero or full balance due depending on payments recorded so far.
**Pass criteria:** Invoice number assigned, totals match the proposal, renders correctly (check the "Print/Save PDF" flow actually produces a usable PDF via the browser print dialog).

## Scenario 11 — Payment

**Steps:** Record a partial payment against the proposal, then a second payment that completes the balance.
**Expected:** Both payments appear in payment history with correct receipt numbers (DB-trigger-assigned); the proposal status becomes/remains `accepted`; the invoice's balance due updates correctly after each payment.
**Pass criteria:** Balance due arithmetic correct after each payment; **the proposal's `accepted_at` timestamp is set** (this session's fix — verify directly in the database or by confirming the deal appears in the Revenue Dashboard's totals, not just its `status` field).

## Scenario 12 — Timeline

**Steps:** Open the customer's timeline (from their profile).
**Expected:** Every action across this test — enquiry, reservation, proposal, conversion, payments — appears in chronological order with correct descriptions.
**Pass criteria:** No missing events, no duplicate events, correct order.

## Scenario 13 — Calendar

**Steps:** Open the Reservation Calendar and locate the test reservation(s).
**Expected:** Correct dates, correct room, correct status color/label, matches what Scenario 5/6 created.
**Pass criteria:** Calendar view accurately reflects reservation data.

## Scenario 14 — Operations Dashboard

**Steps:** Open the Operations Dashboard.
**Expected:** Pending payments, occupancy, and repeat-guest figures reflect the test data created above (already confirmed in code review to read the live `reservations` table correctly, per RC3 — this scenario is the live-data confirmation).
**Pass criteria:** Figures match what was actually created in this test pass.

## Scenario 15 — Revenue Dashboard

**Steps:** Open the Revenue Dashboard.
**Expected:** The accepted proposal from Scenario 11 appears in Total Revenue and the Accepted proposals count (this is the exact fix from this session's payment-route `accepted_at` bug and RC3's `bookings`→`reservations` bug — both should now show correctly). Bookings/Confirmed KPIs reflect the real reservation created in Scenario 5, not zero.
**Pass criteria:** Revenue total includes the test payment; Bookings KPI is non-zero and matches the real reservation count; no "Reservation platform not live yet" degraded label showing (if it is, migration 012 didn't actually apply — stop and investigate before continuing UAT).

## Scenario 16 — Campaigns (only if migration 004 was applied — see deployment guide §3a)

**Steps:** Open `/campaigns`, view the list (should be empty initially, not an error), create a test campaign targeting a small segment, preview it.
**Expected:** No 500 errors at any step; campaign list loads; preview shows a plausible recipient count.
**Pass criteria:** Full campaign creation flow works without error. **If migration 004 was deliberately skipped, this scenario is N/A — confirm instead that the Campaigns nav link was hidden rather than left pointing at a broken page.**

## Sign-off

UAT passes when every scenario above is marked Pass, or every Fail has an accepted, documented reason (e.g. deliberately out of scope for this launch). Record results in `GO_LIVE_CHECKLIST.md`'s UAT row.
