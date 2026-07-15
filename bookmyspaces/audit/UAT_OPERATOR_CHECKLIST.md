# BookMySpaces V3 — UAT Operator Checklist

Convert-format of `USER_ACCEPTANCE_TEST_PLAN.md` for the person actually running UAT, not the engineer who wrote it. Run every scenario in order — several depend on data created by an earlier one. Record results directly in this file's Pass/Fail boxes, or a copy of it.

**Run only after** `PRODUCTION_DEPLOYMENT_SEQUENCE.md` steps 1–15 are complete and passed.

## Setup (once, before Scenario 1)

- [ ] At least one property has real `inventory_items` and `rate_plans` (added via Supabase Table Editor — no admin UI exists for this yet).
- [ ] A test WhatsApp number is available to send messages from.

---

## Scenario 1 — Customer Enquiry

**Preconditions:** Setup complete; test WhatsApp number ready.
**Steps:** Send a WhatsApp message to the business number from the test phone, asking about availability, as a real prospective customer would.
**Expected Result:** Message appears in the CRM inbox within a few seconds; a new lead is created with the correct phone number and message content.
**Pass:** ☐ Message visible in CRM, correctly attributed, no duplicate lead.
**Fail:** ☐ Message missing, wrong attribution, or duplicate lead created.
**Evidence Required:** Screenshot of the CRM inbox entry + the lead record.

## Scenario 2 — Identity Resolution

**Preconditions:** Scenario 1 passed.
**Steps:** Send a second enquiry from the same test phone (different channel if possible, e.g. website chat widget, or a second WhatsApp message later).
**Expected Result:** Both messages resolve to the same customer/lead record.
**Pass:** ☐ One lead record; both messages appear on its timeline.
**Fail:** ☐ A second, duplicate lead is created for the same phone number.
**Evidence Required:** Screenshot of the single lead's timeline showing both messages.

## Scenario 3 — Customer Search

**Preconditions:** Scenario 1 passed.
**Steps:** Search the CRM for the test customer by name, then separately by phone number.
**Expected Result:** Both searches return the correct customer record.
**Pass:** ☐ Correct record found both ways, no false positives.
**Fail:** ☐ Missing result or wrong record returned by either search method.
**Evidence Required:** Screenshot of each search's result.

## Scenario 4 — Customer Profile

**Preconditions:** Scenario 1 passed.
**Steps:** Open the test customer's profile page.
**Expected Result:** Correct contact details, full conversation history, and the AI Operator Assistant panel (Customer Summary / Suggested Reply / Recommendations) loads without error.
**Pass:** ☐ All data accurate; AI panel loads successfully.
**Fail:** ☐ Missing/incorrect data, or AI panel errors out.
**Evidence Required:** Screenshot of the profile page including the AI panel.

## Scenario 5 — Reservation

**Preconditions:** Real inventory item + rate plan exist (Setup).
**Steps:** From the Reservation Dashboard, create a new reservation for the test customer against the real inventory item, for a real date range.
**Expected Result:** Reservation created in `inquiry` status, visible on the dashboard and Reservation Calendar for the correct dates.
**Pass:** ☐ Reservation created with correct guest/date/property/room, appears on Calendar.
**Fail:** ☐ Creation fails, or details/dates are wrong.
**Evidence Required:** Screenshot of the reservation record and its Calendar entry.

## Scenario 6 — Availability

**Preconditions:** Scenario 5 passed.
**Steps:** Attempt a second reservation for the same room with overlapping dates. Then attempt one for a genuinely free date range.
**Expected Result:** The overlapping attempt is blocked or clearly flagged; the free-date attempt succeeds normally.
**Pass:** ☐ Conflict prevented/flagged; free dates succeed.
**Fail:** ☐ Overlapping booking is silently allowed.
**Evidence Required:** Screenshot of the conflict warning/block.

## Scenario 7 — Pricing

**Preconditions:** Scenario 5 passed.
**Steps:** Check the calculated price shown for the Scenario 5 reservation.
**Expected Result:** Price equals the rate plan rate × number of nights, correctly.
**Pass:** ☐ Displayed price arithmetically correct.
**Fail:** ☐ Price is wrong or missing.
**Evidence Required:** Screenshot of the price breakdown alongside the rate plan value used.

## Scenario 8 — Proposal

**Preconditions:** Scenario 5 passed.
**Steps:** From the Reservation Details screen, generate a proposal from the reservation.
**Expected Result:** New proposal created, linked to the reservation, with correct customer/venue/pricing carried over.
**Pass:** ☐ Proposal created; reservation link correct; pricing matches Scenario 7.
**Fail:** ☐ Proposal missing data, wrong link, or pricing mismatch.
**Evidence Required:** Screenshot of the proposal showing the reservation reference.

## Scenario 9 — Proposal Conversion

**Preconditions:** An existing proposal not tied to a reservation (create one ad hoc if none exists).
**Steps:** Use "Convert to Reservation" on that proposal.
**Expected Result:** A new reservation is created from the proposal, correctly populated.
**Pass:** ☐ Reservation created with matching customer/date/venue details.
**Fail:** ☐ Conversion fails or produces incorrect data.
**Evidence Required:** Screenshot of the resulting reservation.

## Scenario 10 — Invoice

**Preconditions:** Scenario 8 or 9 passed.
**Steps:** Open Financial Documents → Latest Invoice for that proposal. Use "Print/Save PDF."
**Expected Result:** Correctly formatted invoice with accurate line items and totals; PDF export works via the browser print dialog.
**Pass:** ☐ Invoice number assigned, totals match proposal, PDF renders correctly.
**Fail:** ☐ Wrong totals, missing invoice number, or PDF export fails.
**Evidence Required:** The exported PDF file itself.

## Scenario 11 — Payment

**Preconditions:** Scenario 10 passed (invoice exists).
**Steps:** Record a partial payment against the proposal, then a second payment completing the balance.
**Expected Result:** Both payments appear with correct receipt numbers; proposal status becomes/remains `accepted`; invoice balance updates correctly after each payment; proposal's `accepted_at` timestamp is set.
**Pass:** ☐ Balance arithmetic correct after each payment AND deal appears in Revenue Dashboard totals (confirms `accepted_at`, not just `status`).
**Fail:** ☐ Balance wrong, receipt numbers missing, or deal absent from Revenue Dashboard despite `accepted` status.
**Evidence Required:** Screenshots of both payment receipts + Revenue Dashboard showing the deal counted.

## Scenario 12 — Timeline

**Preconditions:** Scenarios 1–11 complete.
**Steps:** Open the test customer's timeline from their profile.
**Expected Result:** Every action from this test run — enquiry, reservation, proposal, conversion, payments — appears in correct chronological order.
**Pass:** ☐ No missing or duplicate events, correct order.
**Fail:** ☐ Events missing, duplicated, or out of order.
**Evidence Required:** Screenshot of the full timeline.

## Scenario 13 — Calendar

**Preconditions:** Scenario 5/6 passed.
**Steps:** Open the Reservation Calendar and locate the test reservation(s).
**Expected Result:** Correct dates, room, and status color/label matching what was created earlier.
**Pass:** ☐ Calendar accurately reflects reservation data.
**Fail:** ☐ Wrong dates, room, or status shown.
**Evidence Required:** Screenshot of the Calendar view.

## Scenario 14 — Operations Dashboard

**Preconditions:** Scenarios 1–11 complete.
**Steps:** Open the Operations Dashboard.
**Expected Result:** Pending payments, occupancy, and repeat-guest figures reflect the test data created in this run.
**Pass:** ☐ Figures match what was actually created.
**Fail:** ☐ Figures are zero/stale or don't match test data.
**Evidence Required:** Screenshot of the dashboard.

## Scenario 15 — Revenue Dashboard

**Preconditions:** Scenario 11 complete.
**Steps:** Open the Revenue Dashboard.
**Expected Result:** The accepted proposal appears in Total Revenue and the Accepted count; Bookings/Confirmed KPIs reflect the real reservation, not zero; no "Reservation platform not live yet" degraded label.
**Pass:** ☐ Revenue includes test payment; Bookings KPI non-zero and correct; no degraded-state label.
**Fail:** ☐ Any of the above missing — **if the degraded label is showing, STOP: migration 012 did not actually apply. Do not continue UAT until resolved.**
**Evidence Required:** Screenshot of the dashboard.

## Scenario 16 — Campaigns (only if migration 004 was applied)

**Preconditions:** Migration 004 in scope and applied per the deployment sequence.
**Steps:** Open `/campaigns`, view the list (expect empty, not an error), create a test campaign targeting a small segment, preview it.
**Expected Result:** No 500 errors at any step; list loads; preview shows a plausible recipient count.
**Pass:** ☐ Full flow works without error.
**Fail:** ☐ Any step errors.
**N/A:** ☐ Migration 004 deliberately skipped — confirm the Campaigns nav link was hidden rather than left pointing at a broken page.
**Evidence Required:** Screenshot of the campaign preview, or of the hidden nav link if N/A.

---

## Sign-off

UAT passes when every scenario above is marked Pass, or every Fail/N/A has an accepted, documented reason (e.g. deliberately out of scope for this launch).

| Field | Value |
|---|---|
| Tested by | |
| Date | |
| Total scenarios | 16 |
| Passed | |
| Failed | |
| N/A | |
| Overall result | ☐ UAT PASSED &nbsp;&nbsp; ☐ UAT FAILED |
