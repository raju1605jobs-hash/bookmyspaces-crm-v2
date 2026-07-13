'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/app/(crm)/customers/page.tsx
// V3 Sprint 3 — Priority 5 / Definition of Success: "search customer".
//
// A dedicated search entry point into the Customer Profile screen
// (customers/[id]/page.tsx), which previously had no way to reach it other
// than a direct URL or a link buried inside a proposal/reservation. Wraps
// GET /api/leads?search= (already live, already supports name/phone/email/
// event_type matching via .ilike — see src/app/api/leads/route.ts) — no new
// backend, this screen is purely the missing UI on top of an existing,
// working search query.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { Search, RefreshCw, AlertTriangle, Phone, Mail, ChevronRight, UserRound } from 'lucide-react'

interface CustomerResult {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  status: string
  lead_stage: string | null
  event_type: string | null
  created_at: string
}

const STAGE_STYLE: Record<string, string> = {
  NEW: 'bg-gray-100 text-gray-700',
  CONTACTED: 'bg-blue-100 text-blue-700',
  QUALIFIED: 'bg-indigo-100 text-indigo-700',
  NEGOTIATING: 'bg-amber-100 text-amber-700',
  PROPOSAL_SENT: 'bg-purple-100 text-purple-700',
  VISIT_SCHEDULED: 'bg-cyan-100 text-cyan-700',
  CONFIRMED: 'bg-green-100 text-green-700',
  LOST: 'bg-red-100 text-red-700',
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}

export default function CustomerSearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CustomerResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchedFor, setSearchedFor] = useState<string | null>(null)

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/leads?search=${encodeURIComponent(trimmed)}&limit=20`)
      if (!res.ok) throw new Error('Search failed')
      const json = await res.json()
      setResults(json.leads ?? [])
      setSearchedFor(trimmed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Customers</h1>
        <p className="text-sm text-gray-500 mt-0.5">Search by name, phone, or email to open a customer&apos;s profile and history.</p>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); runSearch(query) }}
        className="flex gap-2"
      >
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Priya Sharma, 98765 43210, priya@example.com…"
            className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          Search
        </button>
      </form>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      {results === null ? (
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-12 text-center text-sm text-gray-400">
          <UserRound className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          Search for a customer above to view their profile, reservation history, proposals, and timeline.
        </div>
      ) : results.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-12 text-center text-sm text-gray-400">
          No customers found for &ldquo;{searchedFor}&rdquo;.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="px-6 py-3 font-medium">Name</th>
                <th className="px-3 py-3 font-medium">Contact</th>
                <th className="px-3 py-3 font-medium">Event type</th>
                <th className="px-3 py-3 font-medium">Stage</th>
                <th className="px-6 py-3 font-medium text-right">First seen</th>
              </tr>
            </thead>
            <tbody>
              {results.map((c) => (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-6 py-3">
                    <Link href={`/customers/${c.id}`} className="font-medium text-gray-800 hover:underline">
                      {c.name || 'Unnamed lead'}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-gray-600">
                    {c.phone && <div className="flex items-center gap-1.5"><Phone className="w-3 h-3 text-gray-300" /> {c.phone}</div>}
                    {c.email && <div className="flex items-center gap-1.5 text-xs text-gray-400"><Mail className="w-3 h-3 text-gray-300" /> {c.email}</div>}
                  </td>
                  <td className="px-3 py-3 text-gray-600">{c.event_type || '—'}</td>
                  <td className="px-3 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STAGE_STYLE[c.lead_stage || ''] ?? 'bg-gray-100 text-gray-700'}`}>
                      {(c.lead_stage || c.status).replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right text-gray-500">
                    {fmtDate(c.created_at)}
                    <Link href={`/customers/${c.id}`}>
                      <ChevronRight className="w-3.5 h-3.5 inline text-gray-300 ml-1" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
