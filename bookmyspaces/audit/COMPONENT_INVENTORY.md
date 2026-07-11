# COMPONENT_INVENTORY.md — src/components/** (Part 7)

## File count by folder (VERIFIED via `find`)

| Folder | Files | LOC |
|---|---|---|
| `src/components/auth/` | 1 (`UserMenu.tsx`) | 145 |
| `src/components/chatbot/` | 1 (`ChatWidget.tsx`) | 223 |
| `src/components/layout/` | 2 (`CRMLayout.tsx`, `CRMShell.tsx`) | 56, 195 |
| **Total** | **4 files** | **619** |

Machine-readable: `components.csv`.

## Components exceeding 400 LOC

VERIFIED — zero files inside `src/components/**` exceed 400 LOC (largest is `ChatWidget.tsx` at 223 lines).

VERIFIED — one file elsewhere in the codebase, colocated inside a route folder rather than under `src/components/`, exceeds 400 LOC and functions as a page-level component: `src/app/(crm)/dashboard/HotLeadDashboard.tsx` — 932 lines. Because Part 7 scopes strictly to `src/components/**`, this file falls outside that literal path, but it is reported here since it is the only >400-LOC UI-rendering file found anywhere in the project and is the closest match to what this Part is evidently checking for (per the instruction to flag potential God Components).

### `src/app/(crm)/dashboard/HotLeadDashboard.tsx` — detail (VERIFIED via full grep pass)

- LOC: 932.
- Hooks (counted via `grep -o` occurrence count, not line count): `useState(` × 4, `useEffect(` × 2, `useCallback(` × 1, `useMemo(` × 0, `useRef(` × 0. Import line: `import { useState, useEffect, useCallback, useRef } from 'react'` (line 3).
- Default export: `export default function SalesOperationsDashboard()` at line 615.
- Internal function components defined inline in the same file (VERIFIED via `grep -n "^function "`): `computeIntelligence` (109, non-component helper), `priorityValue` (227, helper), `formatINR` (272, helper), `timeAgo` (279, helper), `ScoreBadge` (289), `TempBadge` (295), `StagePill` (301), `NextActionBadge` (307), `StaleBadge` (320), `StatCard` (330), `PriorityQueueCard` (348), `PipelineCard` (398), `StageDropdown` (416, contains its own `useState`/`useEffect`/`useRef` at lines 419-423), `LeadRow` (480), `SortTh` (594) — **9 rendering sub-components plus several pure helpers, all defined in one file rather than split into `src/components/`.**
- No formal `interface *Props` declarations found (`grep -n "interface.*Props"` returned zero matches) — prop types are inline-destructured function parameters instead.
- **God Component flag: YES.** Complexity: HIGH (932 lines, 9 inline sub-components, primary dashboard data-fetch-and-render logic all in one file).

Full metrics: `component_metrics.csv`.

## UNINSPECTED ITEMS (Part 7 scope)

None for the literal `src/components/**` scope (all 4 files counted and sized). `HotLeadDashboard.tsx` internals beyond hook/export/sub-component counts (e.g., full prop-drilling analysis) were not exhaustively reviewed line-by-line.
