# BookMySpaces CRM — Master Context

## Project Vision
AI-powered CRM and automation platform for:
- banquet bookings
- event sales
- proposals
- WhatsApp lead conversion
- follow-up automation
- room/property upselling
- campaign automation

Goal:
Transform inbound WhatsApp/event leads into a fully automated sales pipeline.

---

# Tech Stack

## Frontend
- Next.js 14 App Router
- React
- TypeScript
- TailwindCSS

## Backend
- Supabase
- PostgreSQL
- Route Handlers
- Server-side APIs

## Deployment
- Vercel

## Integrations
- WhatsApp automation
- Proposal sharing
- AI scoring
- Campaign workflows

---

# Current Architecture

## Lead Intelligence
- AI lead scoring
- urgency scoring
- lead temperature
- stale lead detection
- follow-up intelligence
- escalation system

## Dashboard
- Sales operations dashboard
- hot lead monitoring
- overdue tracking
- proposal urgency
- pipeline intelligence

## Proposal Engine
- proposal generation
- proposal intelligence
- engagement tracking
- urgency scoring
- PDF sharing
- share links
- WhatsApp proposal actions

## Auth Architecture
Split auth architecture:
- supabase-browser.ts
- supabase-server.ts
- supabase-middleware.ts

Purpose:
Prevent Next.js App Router client/server import conflicts.

---

# Public Routes

Must ALWAYS remain public:

- /api/whatsapp/webhook
- /proposals/share/[token]
- /api/proposal/share/[token]

---

# Protected Routes

Require authentication:

- /dashboard
- /proposals
- /campaigns
- /kanban
- /settings

---

# Completed Phases

## Phase 1–3
- CRM foundation
- lead ingestion
- WhatsApp intake
- AI lead scoring

## Phase 4
- dashboard intelligence
- follow-up intelligence
- urgency engine
- stale lead detection

## Phase 5
- proposal intelligence engine
- proposal urgency scoring
- engagement tracking
- proposal actions

## Phase 5.5
- auth foundation
- middleware
- login system
- notification foundation
- role management foundation

---

# Current Build Status

## Stable
- dashboard
- proposal intelligence
- API routes
- proposal tracking
- lead intelligence

## Current Active Issue
/auth/login page:
- useSearchParams Suspense boundary issue
- App Router rendering stabilization pending

---

# Pending Features

## Operational Core
- auth stabilization
- callback testing
- logout testing
- user menu integration

## Campaign Engine
- bulk WhatsApp campaigns
- Excel lead import
- campaign scheduling
- campaign analytics

## Automation
- follow-up automation
- reminder scheduling
- auto escalation
- smart notifications

## Property Upsell System
- room inventory
- room offers
- proposal room upsells
- high-demand room recommendations

---

# Engineering Rules

## Critical
- Do NOT rewrite stable modules
- Preserve existing APIs
- Preserve webhook routes
- Preserve proposal share links
- Preserve App Router compatibility

## Architecture Rules
- client components → supabase-browser.ts
- server routes/components → supabase-server.ts
- middleware only → supabase-middleware.ts

## Development Approach
- stabilize before expanding
- fix exact issues only
- avoid broad rewrites
- maintain backward compatibility

---

# Current Priority

1. Stabilize authentication
2. Resolve login page build issue
3. Verify callback/logout flow
4. Integrate user menu
5. Begin campaign engine