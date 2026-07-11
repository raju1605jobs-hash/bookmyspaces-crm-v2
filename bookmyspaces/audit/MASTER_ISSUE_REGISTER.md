# MASTER_ISSUE_REGISTER.md

52 issues, converted 1:1 from the verified findings in the 18 files under `C:\rajubmp\bookmyspaces\audit\`. This document is the readable, grouped view (Step 2 categorization). **Full structured fields for every issue (evidence, dependencies, root cause, business/technical impact, risk of fix, effort, regression risk, testing, rollback, status, phase) live in `MASTER_ISSUE_REGISTER.csv` — that CSV is the source of truth; this file is a navigable summary of it.**

Severity legend: 🔴 Critical · 🟠 High · 🟡 Medium · ⚪ Low. Status legend: **Ready** (no blocker, can be scheduled), **Blocked** (has an unresolved prerequisite), **Deferred** (not required for production stability, scheduled later).

---

## Security / Authentication / Authorization (8 issues)

- **ISS-001** 🔴 Critical · Ready · Phase 2 — Zero authentication enforcement anywhere in the request path (middleware is a no-op; no page layout performs an auth check). *AUTH_AUDIT.md*
- **ISS-002** 🔴 Critical · Ready · Phase 2 — 26 of 31 API routes perform no session/auth check at all. *ROUTES.md*
- **ISS-003** 🟠 High · Ready · Phase 2 — Admin role check compares the wrong field; likely always denies or never denies. *AUTH_AUDIT.md*
- **ISS-004** 🟠 High · Ready · Phase 2 — WhatsApp webhook POST handler has no signature/HMAC verification. *AUTH_AUDIT.md, ROUTES.md*
- **ISS-005** 🟠 High · Ready · Phase 5 — Zero routes use zod; no input validation anywhere. *ROUTES.md, PROJECT_DISCOVERY.md*
- **ISS-026** 🟡 Medium · Ready · Phase 4 — Two conflicting `middleware.ts` files (root dead duplicate + active `src/` one). *AUTH_AUDIT.md*
- **ISS-033** 🟡 Medium · Ready · Phase 2 — Server Actions CSRF origin check disabled (`allowedOrigins: ['*']`). *DEPLOYMENT_AUDIT.md*
- **ISS-034** 🟡 Medium · Ready · Phase 8 — No security headers (CSP, X-Frame-Options, etc.) configured. *DEPLOYMENT_AUDIT.md*

## Database / Supabase / RLS (9 issues)

- **ISS-006** 🟠 High · Blocked · Phase 3 — 28 of 31 routes use the service-role client, bypassing RLS entirely (architecture-level; needs a design decision, see DEPENDENCY_GRAPH.md). *ROUTES.md, DATABASE_AUDIT.md*
- **ISS-007** 🟠 High · Ready · Phase 3 — `notification_settings` has a policy but RLS was never enabled on the table. *DATABASE_AUDIT.md*
- **ISS-008** 🟠 High · Ready · Phase 3 — `conversations` anon UPDATE policy has no row scoping (`USING (TRUE)`). *DATABASE_AUDIT.md*
- **ISS-009** 🔴 Critical · Blocked · Phase 3 — 5 tables/views used by live routes (`active_users_view`, `invoices`, `lead_imports`, `payments`, `user_profiles`) don't exist in any migration. *DATABASE_AUDIT.md, ROUTES.md*
- **ISS-010** 🔴 Critical · Blocked · Phase 3 — `leads.lead_stage` column used extensively in code, never created by any migration. *DATABASE_AUDIT.md*
- **ISS-011** 🟡 Medium · Ready · Phase 0 — Migration `009` is missing from the sequence (gap between 008 and 010). *DATABASE_AUDIT.md*
- **ISS-012** ⚪ Low · Deferred · Phase 3 — `leads_needing_followup` view defined 3 separate times across migration history. *DATABASE_AUDIT.md*
- **ISS-049** 🟡 Medium · Blocked · Phase 0 — Whether ISS-009/ISS-010 are live schema drift or genuinely broken is unresolved without DB access — **this is the prerequisite investigation for both.** *DATABASE_AUDIT.md*
- **ISS-013** ⚪ Low · Ready · Phase 4 — Duplicate `007_missing_tables.sql` outside `supabase/migrations/`. *DATABASE_AUDIT.md, PROJECT_DISCOVERY.md*

## API / Business Logic (9 issues)

- **ISS-015** 🟠 High · Blocked · Phase 5 — Entire secondary WhatsApp subsystem (6 files, ~1020 LOC) is dead code, zero importers. *LIBRARY_INVENTORY.md*
- **ISS-016** 🟠 High · Ready · Phase 5 — `ai-summary.ts` fully implemented but unreachable; its route is a stub. *LIBRARY_INVENTORY.md, ROUTES.md*
- **ISS-017** 🟠 High · Ready · Phase 5 — Escalation engine has zero importers anywhere. *MODULE_INVENTORY.md*
- **ISS-018** 🟠 High · Blocked · Phase 5 — Follow-up cadence engine/rules have zero importers anywhere. *MODULE_INVENTORY.md*
- **ISS-019** 🟠 High · Ready · Phase 4 — Lead-stage state machine reachable only through a dead, misnamed route. *MODULE_INVENTORY.md, ROUTES.md*
- **ISS-020** 🟠 High · Ready · Phase 4 — 2 API route files are misnamed and never registered as routes. *ROUTES.md*
- **ISS-041** 🟠 High · Ready · Phase 6 — Proposal "email" feature doesn't send email — returns a `mailto:` link only. *PROJECT_DISCOVERY.md*
- **ISS-042** 🟡 Medium · Ready · Phase 5 — Unawaited fire-and-forget DB write with a swallowed error in the email route. *PROJECT_DISCOVERY.md, LIBRARY_INVENTORY.md*
- **ISS-047** 🟡 Medium · Ready · Phase 6 — WhatsApp auto-reply quotes hardcoded generic pricing that doesn't match real seeded packages. *ROUTES.md, DATABASE_AUDIT.md*

## Third-Party Integrations — WhatsApp / Email / AI / Google Sheets (3 issues, beyond those already listed above)

- **ISS-043** 🟡 Medium · Blocked · Phase 5 — Two independent, non-shared implementations of the same Meta Graph API call (resolved together with ISS-015). *LIBRARY_INVENTORY.md*
- (WhatsApp webhook signature gap is ISS-004, above; dead WhatsApp v2 subsystem is ISS-015, above; broken email is ISS-041, above.)
- No issues were found specific to the Google Sheets or AI/RAG integrations beyond the general findings already listed (hardcoded contact info, ISS-044; missing tests, ISS-031).

## Frontend / Code Quality / Dead Code / Duplicate Code (11 issues)

- **ISS-021** ⚪ Low · Ready · Phase 4 — 3 empty brace-glob directories + 1 empty stray directory in `src/app/api`. *ROUTES.md, PROJECT_DISCOVERY.md*
- **ISS-022** ⚪ Low · Ready · Phase 4 — Stray backup `.zip` inside a live API route folder. *ROUTES.md*
- **ISS-027** 🟡 Medium · Ready · Phase 2 — Two independent OAuth callback implementations diverge in behavior. *AUTH_AUDIT.md*
- **ISS-028** ⚪ Low · Ready · Phase 7 — OAuth failure redirect target (`/auth/auth-code-error`) doesn't exist (404). *AUTH_AUDIT.md*
- **ISS-030** 🟡 Medium · Deferred · Phase 8 — `HotLeadDashboard.tsx` is a 932-line God Component with 16 inline sub-components. *COMPONENT_INVENTORY.md*
- **ISS-032** 🟡 Medium · Ready · Phase 4 — Two Tailwind config files with divergent font-family definitions. *DEPLOYMENT_AUDIT.md*
- **ISS-035** 🟡 Medium · Deferred · Phase 8 — 77 explicit `any`-type escapes erode `strict: true`. *CODE_METRICS.md*
- **ISS-039** ⚪ Low · Deferred · Phase 8 — 89 `console.*` calls left in production code paths repo-wide. *CODE_METRICS.md, ROUTES.md*
- **ISS-040** 🟡 Medium · Ready · Phase 1 — Debug block dumps payment/invoice data to production logs — **fast, high-value, do immediately.** *ROUTES.md*
- **ISS-044** 🟡 Medium · Deferred · Phase 8 — Business contact info/pricing hardcoded across 6+ library files. *LIBRARY_INVENTORY.md*
- **ISS-046** ⚪ Low · Deferred · Phase 8 — `CookieItem` interface duplicated in two files. *LIBRARY_INVENTORY.md*

## Performance (2 issues)

- **ISS-045** ⚪ Low · Deferred · Phase 8 — Proposal PDF generation fetches Google Fonts live over the network at render time. *LIBRARY_INVENTORY.md*
- **ISS-051** ⚪ Low · Deferred · Phase 8 — Blanket `no-store` cache header on all API routes; no differentiated caching. *DEPLOYMENT_AUDIT.md*

## Testing / Developer Experience / Documentation / Deployment (8 issues)

- **ISS-031** 🔴 Critical · Ready · Phase 9 (setup in Phase 0/1) — No automated testing of any kind exists in the project. *DEPLOYMENT_AUDIT.md*
- **ISS-036** 🟠 High · Ready · Phase 8 — No centralized environment variable configuration or startup validation. *CODE_METRICS.md*
- **ISS-037** 🟠 High · Ready · Phase 8 — `.env.example` variable names don't match what the code actually reads. *CODE_METRICS.md*
- **ISS-038** ⚪ Low · Ready · Phase 8 — 5 declared env vars are completely unused. *CODE_METRICS.md*
- **ISS-029** ⚪ Low · Ready · Phase 8 — `ADMIN_EMAIL`/`ADMIN_PASSWORD` declared but unused (specific instance of ISS-038). *AUTH_AUDIT.md*
- **ISS-050** 🟠 High · Ready · Phase 10 — No one-click install / setup wizard / startup env validation exists. *DEPLOYMENT_AUDIT.md*
- **ISS-048** ⚪ Low · Deferred · Phase 9 — Unverified whether any CRM page renders mock data instead of live data. *PAGE_INVENTORY.md*
- **ISS-052** ⚪ Low · Deferred · Phase 9 — 2 pages outside the original audit's literal scope were never evaluated. *PAGE_INVENTORY.md*

## Technical Debt / Repository Hygiene (5 issues)

- **ISS-014** ⚪ Low · Deferred · Phase 5 — Hardcoded phone number baked directly into migration seed data (×3). *DATABASE_AUDIT.md*
- **ISS-023** ⚪ Low · Deferred · Phase 4 (needs user sign-off) — Full duplicate project copy (`BOOKMYSPACES_BACKUP/`) committed alongside the live app. *PROJECT_DISCOVERY.md*
- **ISS-024** ⚪ Low · Deferred · Phase 4 — 8 historical one-off fix/migration scripts left at the project root. *PROJECT_DISCOVERY.md*
- **ISS-025** ⚪ Low · Blocked · Phase 1 — Stray root artifact files (`git`, `npm`, `latest.json`, `logs.json`, etc.) whose contents were not re-verified in this audit round — **must be reviewed before classification as routine cleanup vs. a security incident.** *PROJECT_DISCOVERY.md*
- (Migration/view duplication is ISS-011, ISS-012, ISS-013, above.)

---

## Category cross-reference (every issue, one line each)

| ID | Category | Severity | Status |
|---|---|---|---|
| ISS-001 | Security/Authentication | Critical | Ready |
| ISS-002 | Security/API | Critical | Ready |
| ISS-003 | Security/Authorization | High | Ready |
| ISS-004 | Security/Integrations-WhatsApp | High | Ready |
| ISS-005 | Security/API | High | Ready |
| ISS-006 | Security/Database | High | Blocked |
| ISS-007 | Database/RLS | High | Ready |
| ISS-008 | Database/RLS | High | Ready |
| ISS-009 | Database/Business-Logic | Critical | Blocked |
| ISS-010 | Database/Business-Logic | Critical | Blocked |
| ISS-011 | Database/Technical-Debt | Medium | Ready |
| ISS-012 | Database/Technical-Debt | Low | Deferred |
| ISS-013 | Technical-Debt/Repository-Hygiene | Low | Ready |
| ISS-014 | Configuration/Data | Low | Deferred |
| ISS-015 | Dead-Code/Integrations-WhatsApp | High | Blocked |
| ISS-016 | Dead-Code/Business-Logic | High | Ready |
| ISS-017 | Dead-Code/Business-Logic | High | Ready |
| ISS-018 | Dead-Code/Business-Logic | High | Blocked |
| ISS-019 | Dead-Code/Business-Logic | High | Ready |
| ISS-020 | Dead-Code/API | High | Ready |
| ISS-021 | Technical-Debt/Repository-Hygiene | Low | Ready |
| ISS-022 | Technical-Debt/Repository-Hygiene | Low | Ready |
| ISS-023 | Technical-Debt/Repository-Hygiene | Low | Deferred |
| ISS-024 | Technical-Debt/Repository-Hygiene | Low | Deferred |
| ISS-025 | Technical-Debt/Repository-Hygiene | Low | Blocked |
| ISS-026 | Security/Configuration | Medium | Ready |
| ISS-027 | Authentication/Duplicate-Code | Medium | Ready |
| ISS-028 | Authentication/Frontend | Low | Ready |
| ISS-029 | Configuration/Documentation | Low | Ready |
| ISS-030 | Frontend/Code-Quality | Medium | Deferred |
| ISS-031 | Testing | Critical | Ready |
| ISS-032 | Frontend/Duplicate-Code | Medium | Ready |
| ISS-033 | Security/Configuration | Medium | Ready |
| ISS-034 | Security/Configuration | Medium | Ready |
| ISS-035 | Code-Quality/Type-Safety | Medium | Deferred |
| ISS-036 | Configuration/Deployment | High | Ready |
| ISS-037 | Documentation/Deployment | High | Ready |
| ISS-038 | Configuration/Documentation | Low | Ready |
| ISS-039 | Code-Quality/Logging | Low | Deferred |
| ISS-040 | Security/Code-Quality | Medium | Ready |
| ISS-041 | Business-Logic/Integrations-Email | High | Ready |
| ISS-042 | Code-Quality/Error-Handling | Medium | Ready |
| ISS-043 | Integrations-WhatsApp/Duplicate-Code | Medium | Blocked |
| ISS-044 | Configuration/Maintainability | Medium | Deferred |
| ISS-045 | Frontend/Performance | Low | Deferred |
| ISS-046 | Code-Quality/Duplicate-Code | Low | Deferred |
| ISS-047 | Integrations-WhatsApp/Business-Logic | Medium | Ready |
| ISS-048 | Testing/Verification | Low | Deferred |
| ISS-049 | Database/Business-Logic | Medium | Blocked |
| ISS-050 | Deployment/DeveloperExperience | High | Ready |
| ISS-051 | Performance/Configuration | Low | Deferred |
| ISS-052 | Frontend | Low | Deferred |

**Totals: 52 issues — 5 Critical, 16 High, 14 Medium, 17 Low (verified by direct count against `MASTER_ISSUE_REGISTER.csv`). Status: Ready issues can be scheduled immediately within their listed phase; Blocked issues require their stated prerequisite to close first; Deferred issues are not required for a stable production release and are scheduled for later, optional work.**
