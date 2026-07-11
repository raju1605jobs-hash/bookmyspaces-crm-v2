# LIBRARY_INVENTORY.md — src/lib, src/lib/whatsapp, src/services/whatsapp (Part 5)

LOC and export lists VERIFIED via `wc -l` and `grep -n "^export "` across every file in scope. TODO/FIXME VERIFIED zero matches across all files in this Part (`grep -rn "TODO\|FIXME" src/lib src/modules src/services`).

## src/lib/*.ts (21 files)

| File | LOC | Key exports | Notes |
|---|---|---|---|
| `ai-summary.ts` | 168 | `DailySummaryData` (interface, line 15), `generateDailySummary()` (63), `sendDailySummaryWhatsApp()` (138), `detectAndFlagVIPLeads()` (149) | Fully implemented but unreachable — the only caller would be `/api/ai-summary/route.ts`, which is an 18-line stub that never imports this file (VERIFIED — no import of `ai-summary` found in the route). |
| `ai.ts` | 319 | `SYSTEM_PROMPT` (26), `isValidIndianPhone` (64), `normalizePhone` (69), `sanitizeString` (77), `parseEventDate` (85), `parseGuestCount` (99), `ExtractedLeadData` (106), `extractLeadFromTag` (117), `extractLeadViaAI` (137), `mergeExtracted` (166), `hasMinimumLeadData` (184), `cleanAIResponse` (189), `generateEmbedding` (196), `retrieveRelevantKnowledge` (204), `Message` (243), `chatWithAI` (251), `generateConversationSummary` (286), `chunkText` (308) | `SYSTEM_PROMPT` hardcodes contact numbers `9830509991`/`9123005489` (line 32) and `9051459463`/`7003853624` (line 37, 48, 50) directly in the AI prompt text, and a fallback error message at line 249 also hardcodes `9051459463`. |
| `campaigns.ts` | 161 | `FestivalMessage` (10), `generateFestivalMessage` (18), `getUpcomingFestivals` (61), `SegmentFilter` (76), `buildSegment` (86), `generateCampaignMessage` (122) | Hardcodes `9051459463` at lines 35, 47, 49, 50, 140, 160. |
| `documents.ts` | 170 | `processTextIntoKnowledgeBase` (5), `deleteKnowledgeBySource` (42), `getDocuments` (47), `STATIC_KNOWLEDGE` (54) | Hardcodes phone numbers at lines 82, 96, 104, 123, 150. |
| `excel-parser.ts` | 124 | `RawLeadRow` (7), `ParsedLead` (17), `ParseResult` (26), `parseExcelBuffer` (71) | No hardcoded secrets found. |
| `extract-lead-details.ts` | 270 | `ExtractedLeadDetails` (19), `extractLeadDetails` (251) | Regex-based multi-language (English/Bengali/Hindi per file content) extraction; 1 `console.log` (VERIFIED via grep count). |
| `lead-scorer.ts` | 390 | `LeadScoringInput` (25), `ScoreBreakdown` (44), `LeadScoringResult` (61), `parseBudget` (101), `scoreLead` (174) | Pure function, no DB/network calls found. |
| `logger.ts` | 67 | `logger` (55) | 3 `console.*` calls (this file IS the logging wrapper). |
| `proposal-intelligence.ts` | 423 | `ProposalStatus` (14), `RiskLevel` (18), (additional types truncated in scan, plus) `PackageOption` (87), `ProposalUrgencyResult` (94), `generateProposalIntelligence` (192), `computeProposalUrgency` (277) | Hardcodes contact numbers `9830509991` (113), `9051459463` (121). |
| `proposal-pdf.ts` | 586 | `RoomLineItem` (12), `ProposalRenderData` (19), `generateProposalHTML` (170) | Line 278: `@import url('https://fonts.googleapis.com/css2?...')` — live network fetch of Google Fonts CSS at PDF-render time. Line 549 hardcodes `9051459463` in the rendered HTML. |
| `queue.ts` | 119 | `QueuedMessage` (14), `enqueueMessage` (25), `isRateLimited` (55), `markSent` (61), `wasRecentlyContacted` (66), `smartSend` (86) | Rate-limiting/anti-spam layer. |
| `scoring.ts` | 270 | `LeadScore` (29), `scoreLeadWithAI` (41), `ProposalData` (125), `generateProposalCoverNote` (156), `batchScoreLeads` (219) | Anthropic-based scoring. |
| `sheets.ts` | 362 | `SHEET_HEADERS` (10), `isSheetsConfigured` (81), `initializeSheet` (239), `syncLeadToSheets` (284), `updateLeadInSheets` (360) | `updateLeadInSheets(lead: any)` — untyped parameter (line 360). |
| `supabase-browser.ts` | 32 | `createBrowserClient` (16), `UserRole` (24), `AuthUser` (26) | See AUTH_AUDIT.md. |
| `supabase-middleware.ts` | 38 | `createMiddlewareAuthClient` (15) | See AUTH_AUDIT.md. |
| `supabase-route-handler.ts` | 29 | `createSupabaseRouteHandlerClient` (5) | See AUTH_AUDIT.md. |
| `supabase-server.ts` | 55 | `CookieItem` (5), `createSupabaseServerClient` (11), `createServerAuthClient` (40, alias), `getCurrentUser` (43) | See AUTH_AUDIT.md for the role-check implication. |
| `supabase-types.ts` | 7 | `CookieItem` (3) | Duplicate of the interface also defined independently in `supabase-server.ts:5-9` (two separate `CookieItem` interface declarations in the codebase, not shared from one source — PARTIALLY VERIFIED as true duplication vs. intentional re-export, since `supabase-route-handler.ts:3` imports `CookieItem` from `./supabase-types` while `supabase-server.ts` defines its own inline). |
| `supabase.ts` | 27 | `getSupabase` (6), `getSupabaseAdmin` (15) | Module-level singletons (`_admin`, `_browser`, lines 3-4); throws if required env vars missing (lines 10, 19). |
| `templates.ts` | 303 | `WHATSAPP_MESSAGES` (12), `APPROVED_TEMPLATES` (263), `TEMPLATE_PARAMS` (281) | Hardcodes phone number `9051459463` at lines 121, 163, 177, 212, 218, 253, and a UPI ID `9051459463@paytm` at line 121. |
| `transcription.ts` | 76 | `transcribeVoiceNote` (19), `transcribeAudioBuffer` (57) | References WATI env vars (legacy/superseded per other findings — see env_usage.csv). |
| `whatsapp.ts` | 252 | `isMetaConfigured` (20), `sendWhatsAppMessage` (115), `TemplateParam` (152), `sendTemplateMessage` (157), `BroadcastRecipient` (206), `sendBroadcastCampaign` (211), `extractMessageText` (239) | `META_API_VERSION = 'v23.0'` hardcoded (line 17). 38 `console.*` calls — the single heaviest-logging file in the repository (VERIFIED via `grep -c`). Reads `WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID` directly (lines 21-22, 63-64) rather than through a shared config module. |

## src/lib/whatsapp/*.ts (5 files) — VERIFIED ORPHANED SUBSYSTEM

| File | LOC | Key exports | Imported by |
|---|---|---|---|
| `auto-responder.ts` | 241 | `processAutoResponse` (50) | `src/services/whatsapp/process-inbound.ts` only |
| `conversation-manager.ts` | 120 | `getOrCreateConversation` (15), `advanceConversationState` (75), `getConversationByPhone` (110) | `src/lib/whatsapp/auto-responder.ts`, `src/services/whatsapp/process-inbound.ts` |
| `detect-source.ts` | 67 | `detectSourceChannel` (38), `sourceChannelToLeadSource` (60) | `src/lib/whatsapp/lead-resolver.ts`, `src/services/whatsapp/process-inbound.ts` |
| `lead-resolver.ts` | 97 | `ResolvedLead` (11), `resolveLeadByPhone` (23) | `src/services/whatsapp/process-inbound.ts` |
| `send-message.ts` | 192 | `sendWhatsAppText` (48), `sendWhatsAppTemplate` (131) | `src/lib/whatsapp/auto-responder.ts` only |

VERIFIED — `send-message.ts:27` independently hardcodes the same Meta Graph API URL pattern (`https://graph.facebook.com/${WA_API_VERSION}/${phoneNumberId}/messages`) as `whatsapp.ts:75` — two separate, non-shared implementations of the same Meta API call.

## src/services/whatsapp/process-inbound.ts (1 file)

LOC 160. VERIFIED via `grep -rl` across all of `src/app`, `src/lib`, `src/modules`, `src/services` (excluding the file itself): **zero files import `process-inbound.ts`.** This is the entry point of the entire `src/lib/whatsapp/*` state-machine subsystem, and it has no caller anywhere in the codebase — the whole 6-file, ~1020-line subsystem is dead code, confirmed at its root.

VERIFIED — this subsystem's target tables (`whatsapp_messages`, `whatsapp_conversations`, referenced by name inside these files per the earlier recon pass) do not exist in any of the 9 migrations (cross-reference DATABASE_AUDIT.md — a dedicated grep for these two exact table names across `supabase/migrations/*.sql` was run and returned zero matches).

## Unhandled promises / weak error handling (spot-checked, not exhaustive)

VERIFIED — `src/app/api/proposals/email/route.ts:36`: `Promise.resolve(supabaseAdmin.from('proposals').update(...)).catch(() => {})` — fire-and-forget write with a swallowed error, not awaited before the response is sent (this file is a route, not `src/lib`, but is the clearest example found in this pass and is cited here since Part 5 asks specifically about unhandled promises).
VERIFIED — `src/lib/sheets.ts:360` (`updateLeadInSheets(lead: any)`) uses an untyped `any` parameter, eroding the `strict: true` TypeScript setting for any caller.

## UNINSPECTED ITEMS (Part 5 scope)

- Full line-by-line bodies of `ai.ts`, `sheets.ts`, `proposal-pdf.ts`, `templates.ts`, `whatsapp.ts` and others were sampled via targeted grep (exports, hardcoded strings, console usage) rather than read top-to-bottom in this pass; export lists and hardcoded-value line numbers are VERIFIED directly, but exhaustive control-flow/error-handling review of every function body was not performed for every file (would require reading ~4,900 combined lines line-by-line, out of proportion to a reconnaissance-only audit — flagged here rather than silently skipped).
