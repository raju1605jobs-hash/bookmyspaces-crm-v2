# BookMySpaces V3 — Finance User Guide

For staff handling invoicing, payments, and revenue reporting.

## When You Get Involved

Once Sales marks a proposal **Accepted**, it's ready for invoicing and payment. You don't need to wait for a reservation to exist — invoicing is tied to the proposal, not the reservation.

## Generating an Invoice

Proposals page → open the accepted proposal → **Financial Documents** → **Latest Invoice**. The invoice is generated on demand and is idempotent — opening it again updates the same invoice record (correct running balance) rather than creating a duplicate. It shows:
- Line items (event package, room items, add-ons)
- Discount applied
- Amount in words
- Payment history and running balance due
- Payment instructions (UPI ID, phone/WhatsApp)

Use the **Print / Save PDF** button (top right of the invoice) to generate a shareable PDF via the browser's print dialog.

## Recording a Payment

Proposals page → open the accepted proposal → **Record Payment**. Enter amount, date, mode (cash/UPI/card/bank transfer/cheque), and a transaction reference if there is one. The receipt number is assigned automatically — you don't set it.

**Important:** the Record Payment button only appears once a proposal is already **Accepted**. If you don't see it, the proposal hasn't been marked Accepted yet — check with Sales rather than trying to work around it.

## Partial Payments

Record each payment as it comes in — advance, then balance, as separate entries. The invoice automatically sums all payments and recalculates the balance due each time; you never need to manually track a running total yourself.

## Refunds

There is currently no dedicated "Refund" button — until that's built (see `VERSION1_1_ROADMAP.md`), record a refund as a payment with a **negative amount**, `payment_type` "refund", and a clear note explaining why (e.g. "Refund for shortened stay"). This correctly reduces the running balance shown on the invoice. Always double-check the resulting balance looks right after entering a negative amount — a typo here is a real money mistake, not just a display glitch.

## Advance Receipts

Proposals page → **Advance Receipts** shows every payment recorded against a proposal with its receipt number — use this when a customer asks for proof of a specific payment.

## Revenue Dashboard

Shows Total Revenue, This Month, Last Month, Average Deal Value, and pipeline KPIs. **Revenue counts a proposal only once it has both `status = accepted` AND an acceptance timestamp set** — in practice this means: always use the explicit "Mark as Accepted" action on the Proposals page, never rely on recording a payment alone to make a deal "count." (This was a real bug found and fixed during release preparation — see `VERSION1_RELEASE_READINESS_REPORT.md` — so it's worth Finance specifically double-checking any deal that seems to be missing from revenue totals: check whether it was ever explicitly marked Accepted.)

The **Bookings/Confirmed** KPIs on this dashboard reflect the live Reservation Platform (migration 012) — if these show zero or a "Reservation platform not live yet" label, that migration hasn't been applied to this environment; contact your Admin, don't assume it's a reporting bug.

## Operations Dashboard

Shows pending payments, occupancy, and repeat-guest metrics — useful for a daily at-a-glance check separate from the more finance-specific Revenue Dashboard.

## Month-End / Reconciliation Tips

- Cross-check the Revenue Dashboard's "This Month" figure against your own payment log by re-summing the Advance Receipts for each accepted proposal in that month.
- Any proposal marked Accepted with zero payments recorded is a real outstanding balance — don't assume it's a data-entry gap.
