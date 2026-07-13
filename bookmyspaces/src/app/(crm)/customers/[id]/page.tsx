'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/app/(crm)/customers/[id]/page.tsx
// V3 Day 6 — Operator Experience sprint: Customer Profile screen.
//
// Fully live today (no migration 012 dependency for the parts that matter
// most): GET /api/customers/[id] reads `leads` directly, GET
// /api/customers/[id]/timeline wraps Day 4's getCustomerTimeline() which
// already reads chat/WhatsApp/email/activity/proposals/payments from tables
// already in production. Only the Reservation/AI-interaction rows on the
// timeline degrade until migration 012 is applied — surfaced here as a
// small banner, not hidden.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Phone, Mail, Calendar, Users, IndianRupee, MapPin,
  MessageSquare, FileText, Wallet, Bot, Clock, RefreshCw,
  AlertTriangle, ChevronRight, Tag,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Customer {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  event_type: string | null
  event_date: string | null
  guest_count: number | null
  budget: string | null
  venue: string | null
  source: string
  status: string
  lead_stage: string | null
  lead_temperature: string | null
  ai_score: number | null
  estimated_revenue: number | null
  notes: string | null
  created_at: string
}

type TimelineEntryType =
  | 'chat' | 'whatsapp' | 'email' | 'lead_activity' | 'reservation'
  | 'proposal' | 'payment' | 'follow_up' | 'ai_interaction'

interface TimelineEntry {
  type: TimelineEntryType
  timestamp: string
  title: string
  description: string | null
  metadata: Record<string, unknown>
}

interface CustomerTimeline {
  leadId: string
  entries: TimelineEntry[]
  degraded: Partial<Record<TimelineEntryType, boolean>>
}

interface ProposalSummary {
  id: string
  proposal_number: string | null
  package_name: string | null
  total_price: number | null
  status: string
  created_at: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtINR(n: number | null | undefined): string {
  if (!n) return '₹0'
  return '₹' + Number(n).toLocaleString('en-IN')
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

const TIMELINE_ICON: Record<TimelineEntryType, React.ComponentType<{ className?: string }>> = {
  chat: MessageSquare,
  whatsapp: MessageSquare,
  email: Mail,
  lead_activity: Tag,
  reservation: Calendar,
  proposal: FileText,
  payment: Wallet,
  follow_up: Clock,
  ai_interaction: Bot,
}

const TEMPERATURE_STYLE: Record<string, string> = {
  HOT: 'bg-red-100 text-red-700',
  WARM: 'bg-amber-100 text-amber-700',
  COLD: 'bg-blue-100 text-blue-700',
}

export default function CustomerProfilePage({ params }: { params: { id: string } }) {
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [timeline, setTimeline] = useState<CustomerTimeline | null>(null)
  const [proposals, setProposals] = useState<ProposalSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [customerRes, timelineRes, proposalsRes] = await Promise.all([
        fetch(`/api/customers/${params.id}`),
        fetch(`/api/customers/${params.id}/timeline`),
        fetch(`/api/proposals?lead_id=${params.id}`),
      ])

      if (!customerRes.ok) {
        throw new Error(customerRes.status === 404 ? 'Customer not found' : 'Failed to load customer')
      }
      const customerJson = await customerRes.json()
      setCustomer(customerJson.customer)

      if (timelineRes.ok) {
        const timelineJson = await timelineRes.json()
        setTimeline(timelineJson.timeline)
      }

      if (proposalsRes.ok) {
        const proposalsJson = await proposalsRes.json()
        setProposals(proposalsJson.proposals ?? proposalsJson ?? [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load customer')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading customer…
      </div>
    )
  }

  if (error || !customer) {
    return (
      <div className="max-w-2xl mx-auto mt-12 text-center">
        <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
        <p className="text-gray-700 font-medium">{error ?? 'Customer not found'}</p>
        <Link href="/dashboard" className="text-sm text-blue-600 hover:underline mt-3 inline-block">
          ← Back to Dashboard
        </Link>
      </div>
    )
  }

  const degradedTypes = Object.entries(timeline?.degraded ?? {}).filter(([, v]) => v).map(([k]) => k)

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </Link>

      {/* ── Header card ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{customer.name ?? 'Unnamed customer'}</h1>
            <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-600">
              {customer.phone && (
                <span className="inline-flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {customer.phone}</span>
              )}
              {customer.email && (
                <span className="inline-flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {customer.email}</span>
              )}
              <span className="inline-flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Customer since {fmtDate(customer.created_at)}</span>
            </div>
          </div>
          <div className="flex gap-2">
            {customer.lead_temperature && (
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${TEMPERATURE_STYLE[customer.lead_temperature] ?? 'bg-gray-100 text-gray-700'}`}>
                {customer.lead_temperature}
              </span>
            )}
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
              {(customer.lead_stage ?? customer.status)?.replace(/_/g, ' ')}
            </span>
          </div>
        </div>

        {/* Preferences row */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4 pt-5 border-t border-gray-100">
          <div>
            <div className="text-xs text-gray-400 uppercase tracking-wide">Event type</div>
            <div className="text-sm font-medium text-gray-800 mt-0.5">{customer.event_type ?? '—'}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400 uppercase tracking-wide">Event date</div>
            <div className="text-sm font-medium text-gray-800 mt-0.5">{fmtDate(customer.event_date)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-1"><Users className="w-3 h-3" /> Guests</div>
            <div className="text-sm font-medium text-gray-800 mt-0.5">{customer.guest_count ?? '—'}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-1"><IndianRupee className="w-3 h-3" /> Budget</div>
            <div className="text-sm font-medium text-gray-800 mt-0.5">{customer.budget ?? '—'}</div>
          </div>
          {customer.venue && (
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-1"><MapPin className="w-3 h-3" /> Venue preference</div>
              <div className="text-sm font-medium text-gray-800 mt-0.5">{customer.venue}</div>
            </div>
          )}
          {customer.estimated_revenue != null && (
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wide">Estimated revenue</div>
              <div className="text-sm font-medium text-gray-800 mt-0.5">{fmtINR(customer.estimated_revenue)}</div>
            </div>
          )}
        </div>
      </div>

      {degradedTypes.length > 0 && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Reservation history isn&apos;t showing here yet — the Reservation module&apos;s database migration hasn&apos;t been
            applied in this environment. Everything else on this profile (chat, WhatsApp, email, proposals, payments) is live.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Timeline ────────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Timeline</h2>
          {!timeline || timeline.entries.length === 0 ? (
            <p className="text-sm text-gray-400">No activity recorded yet.</p>
          ) : (
            <ol className="space-y-4">
              {timeline.entries.map((entry, i) => {
                const Icon = TIMELINE_ICON[entry.type] ?? Tag
                return (
                  <li key={i} className="flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="w-3.5 h-3.5 text-gray-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium text-gray-800">{entry.title}</span>
                        <span className="text-xs text-gray-400 shrink-0">{fmtDateTime(entry.timestamp)}</span>
                      </div>
                      {entry.description && (
                        <p className="text-sm text-gray-500 mt-0.5 break-words">{entry.description}</p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </div>

        {/* ── Proposals ───────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Proposals</h2>
          {proposals.length === 0 ? (
            <p className="text-sm text-gray-400">No proposals yet.</p>
          ) : (
            <ul className="space-y-3">
              {proposals.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/proposals`}
                    className="flex items-center justify-between gap-2 group"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">
                        {p.proposal_number ?? p.id.slice(0, 8)} — {p.package_name ?? 'Custom'}
                      </div>
                      <div className="text-xs text-gray-400">{fmtDate(p.created_at)} · {p.status}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 text-sm font-semibold text-gray-700">
                      {fmtINR(p.total_price)}
                      <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
