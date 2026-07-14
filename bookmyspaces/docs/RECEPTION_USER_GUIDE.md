# BookMySpaces V3 — Reception User Guide

For front-desk staff handling day-to-day guest interactions: enquiries, check-ins, check-outs, and reservation lookups.

## Logging In

Sign in with your BookMySpaces email/password at the app URL. If you can't log in, contact your Admin — accounts are managed through Supabase Auth, not self-service signup.

## Handling a New Enquiry

Enquiries arrive automatically from WhatsApp, the website chat widget, and other connected channels — they appear in the CRM as a new Lead without any action from you. If a guest calls or walks in instead, add them yourself:

1. Go to **Leads** (or **Kanban** for a pipeline view).
2. Click **New Lead**, fill in name, phone, event/stay details.
3. The system automatically checks whether this phone number already exists (Identity Resolution) — if it matches an existing guest, their history will already be linked; you don't need to search first.

## Customer Search

Go to **Customers**, search by name or phone number. This works even for guests who haven't made a reservation yet — it searches leads too.

## Customer Profile

Opening a customer shows their full history: every conversation, reservation, proposal, and payment, in one timeline. The **AI Assistant** panel on this page can generate a quick summary of the guest or suggest a reply — use it, but always read the suggestion before sending; it's a draft, not an auto-send.

## Creating a Reservation

1. From the **Reservation Dashboard**, click **New Reservation**.
2. Pick the property, then the room/hall (only active inventory shows up — if nothing appears, Admin hasn't added inventory for that property yet).
3. Enter check-in/check-out dates. The system blocks overlapping bookings for the same room automatically — if you see an "unavailable" message, the room is genuinely taken for part of that range; try a different room or dates.
4. Fill in guest details and save. New reservations start in **Inquiry** status.

## Reservation Status — What Each Stage Means

| Status | Meaning | Your action |
|---|---|---|
| Inquiry | Just created, not yet confirmed | Follow up with guest, confirm once details are settled |
| Tentative | Provisionally held | Same — confirm or cancel once guest decides |
| Confirmed | Guest has confirmed | Prepare for arrival |
| Checked In | Guest has arrived | Use **Check In** button when they physically arrive |
| Checked Out | Stay complete | Use **Check Out** button when they leave |
| Cancelled | Booking cancelled | No further action; record a cancellation reason if asked |
| No Show | Guest never arrived | Mark this instead of leaving it stuck on Confirmed |

Move a reservation forward using the action buttons on the **Reservation Details** page — the system won't let you skip a stage (e.g. you can't check someone in who hasn't been confirmed yet).

## Reservation Calendar

Use the **Calendar** view for a visual, date-by-date picture of every room's occupancy — the fastest way to answer "is anything free next weekend?"

## Check-In / Check-Out Day

- **Check-in:** open the reservation, click **Check In**. Confirm guest ID/details match what's on file.
- **Check-out:** open the reservation, verify the balance due on the invoice is settled (or handed to Finance to collect), then click **Check Out**.

## When Something Looks Wrong

- **Guest says they booked but you can't find them:** search by phone first, not just name — spelling variations are common, phone numbers are exact.
- **Room shows unavailable but you know it's free:** check the Calendar for the exact room, not just the room type — you may be looking at a different unit.
- **System error on save:** note the exact error message and what you were doing, then tell your Admin — don't retry the same action repeatedly if it keeps failing the same way.

For anything beyond this guide (pricing changes, proposals, payments, campaigns), see the relevant guide: `SALES_USER_GUIDE.md` or `FINANCE_USER_GUIDE.md`.
