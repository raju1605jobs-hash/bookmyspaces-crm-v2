# BookMySpaces V3 — Sales User Guide

For staff handling the enquiry-to-booking sales pipeline: leads, proposals, and conversions.

## Your Pipeline

**Kanban** and the **Dashboard** both show your lead pipeline by stage (New Inquiry → Followup Pending → Proposal Sent → Negotiation → Confirmed / Rejected). Moving a lead's stage on either screen updates the same underlying record — you can work from whichever view you prefer.

## Working a Lead

1. Open the lead, review its conversation history and AI-generated lead score/summary if present.
2. Log follow-ups as you make them — the CRM tracks `next_follow_up_at`, and hot/overdue leads surface on the Dashboard automatically.
3. When ready, either create a **Reservation** directly (see `RECEPTION_USER_GUIDE.md`) or go straight to a **Proposal**.

## Creating a Proposal

Two ways to start one:
- **From scratch:** Proposals → New Proposal. Fill in client details, event/stay type, venue, package, room items and/or event add-ons, pricing.
- **From an existing Reservation:** open the Reservation Details page → **Generate Proposal** — this carries over guest, dates, room, and pricing automatically so you're not re-typing it.

A proposal's price = base price + room items + add-ons − discount. Double-check the total before sending — once sent, treat it as a real quote to the customer.

## Sending a Proposal

Use **WhatsApp** or **Email** from the Proposals list, or **Copy Link** to share the live proposal page directly. **PDF** downloads a print-ready version. All four send the exact same proposal data — pick whichever channel the customer prefers.

## Proposal Status

| Status | Meaning |
|---|---|
| Draft | Not sent yet |
| Sent | Delivered to customer |
| Viewed | Customer opened the link |
| Accepted | Customer has agreed — **this is the trigger for Finance to record payments** |
| Rejected | Customer declined |
| Expired | Past its validity window |

**Marking a proposal Accepted** is what makes it count toward Revenue Dashboard totals — this is deliberate: a proposal isn't "won" business until someone explicitly marks it so, not just because a payment happened to be logged against it. Use the status dropdown/action on the Proposals page — don't rely on any other action to do this for you.

## Converting a Proposal to a Reservation

If the proposal wasn't created from a reservation, use **Convert to Reservation** once it's accepted — this creates the linked reservation so the guest shows up on the Reservation Dashboard and Calendar, not just as a paper proposal.

## Handing Off to Finance

Once a proposal is accepted, Finance takes over invoicing and payment recording (`FINANCE_USER_GUIDE.md`) — you don't need to do anything further on the money side, but keep an eye on the customer's timeline in case they have questions about the invoice.

## AI Assistant

On the Customer Profile page, use **Suggested Reply** for a draft response to a customer's latest message, and **Recommendations** for room/package suggestions based on their enquiry. Always read before sending — these are drafts to speed you up, not to replace your judgment on tone or accuracy.

## Common Situations

- **Customer wants to negotiate the price:** edit the proposal's discount field and re-send — don't create a second proposal for the same enquiry, it fragments the history.
- **Customer went quiet after a proposal:** the lead's `next_follow_up_at` will flag it as overdue on the Dashboard — that's your cue, not a random check-in.
- **Wrong venue/package on a sent proposal:** edit and re-send; the customer will see the update reflected at the same share link.
