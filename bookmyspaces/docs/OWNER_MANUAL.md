# BookMySpaces V3 — Owner Manual

For Raju, or whoever holds Product Owner / business-owner responsibility for BookMySpaces.

## What This System Does For You

BookMySpaces V3 is a single system covering the full guest lifecycle: enquiries arriving via WhatsApp/website/other channels are automatically captured and matched to the right customer record (even across channels, by phone number), taken through reservation, pricing, and proposal, converted to a booking, invoiced, paid, and tracked on a timeline — with two dashboards (Operations, Revenue) giving you a real-time view of the business, and an AI Assistant helping staff respond faster and more consistently.

## Reading the Revenue Dashboard

**Total Revenue** = the sum of every proposal your team has explicitly marked **Accepted**, using that proposal's total price. This is deliberate: it counts confirmed business, not just money that happened to be recorded — a proposal isn't revenue until someone marks it won. If a number here looks low, the first thing to check isn't "did we get paid" — it's "was this deal marked Accepted."

**Bookings/Confirmed** KPIs reflect real reservations in the Reservation Platform (once live — see Known Risks below). Until then, these will show zero or a "not live yet" label; that's expected, not a bug.

## Reading the Operations Dashboard

Pending payments, occupancy, and repeat-guest figures — your day-to-day pulse check, separate from the money-focused Revenue Dashboard.

## Roles in the System

- **Admin** — full system access, user management, settings.
- **Sales/Manager roles** — CRM, proposals, dashboards (exact permission boundaries are set per user; see `ADMIN_MANUAL.md` for how to configure).
- Staff accounts are created and managed through Supabase Auth, not a self-service signup flow — only an Admin can add a new staff member.

## Campaigns (WhatsApp Marketing)

A built Campaigns feature exists (festival greetings, promotional broadcasts, segmented targeting) but **its backing database tables were not part of the original go-live migration** and may not be active in your environment yet — check with your engineering contact before assuming this feature is usable. If it's not yet enabled, the menu item may be hidden until it is (a deliberate choice, not a missing feature).

## AI Assistant

Available on each Customer Profile: a plain-language summary of the guest, a suggested reply to their latest message, and room/package recommendations. It's a drafting aid for staff, not an autonomous agent — nothing it suggests is sent or acted on without a staff member reviewing it first.

## Known Risks You Should Know About

- **The Reservation Platform (the module underlying Reservations, Availability, Pricing, and the Bookings figures on your Revenue Dashboard) requires a one-time database migration that, as of this manual's writing, had not yet been run in any environment this project's engineering work had access to.** Confirm with your engineering contact that this has been completed before trusting those figures in production.
- **WhatsApp webhook signature verification** — a security control protecting your WhatsApp integration from spoofed messages — depends on a secret value from Meta's developer dashboard that was not yet configured as of this manual's writing. Ask your engineering contact to confirm this is set before go-live.
- **No refund workflow exists yet** — refunds are currently recorded as a negative payment entry by Finance, not a dedicated feature. Fine for now, but worth prioritizing if refund volume grows (see `VERSION1_1_ROADMAP.md`).

## Backup & Recovery

Your data lives in Supabase (managed Postgres) — Supabase provides automatic backups on paid plans; confirm your plan's backup retention window meets your comfort level. See `BACKUP_AND_RESTORE.md` and `DISASTER_RECOVERY_PLAN.md` for the specifics your engineering contact should have in place.

## Where to Go Next

- Day-to-day staff usage: `RECEPTION_USER_GUIDE.md`, `SALES_USER_GUIDE.md`, `FINANCE_USER_GUIDE.md`.
- System administration (users, settings, troubleshooting): `ADMIN_MANUAL.md`.
- What's planned next: `VERSION1_1_ROADMAP.md`.
