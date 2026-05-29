'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  FileText, Send, Eye, Clock, CheckCircle2, XCircle,
  AlertTriangle, Flame, RefreshCw, Download, MessageSquare,
  Mail, Copy, Phone, TrendingUp, Zap, ChevronDown,
  ChevronUp, BarChart3, Filter, Search, ExternalLink,
  Plus,
} from 'lucide-react'
import {
  computeProposalUrgency,
  ProposalUrgencyResult,
  ProposalSnapshot,
  LeadSnapshot,
  ProposalNextAction,
} from '@/lib/proposal-intelligence'

// ─── Types ────────────────────────────────────────────────────────────────────

type ProposalStatus = 'draft' | 'generated' | 'sent' | 'viewed' | 'followed_up' | 'accepted' | 'rejected' | 'expired'
type RiskLevel      = 'low' | 'medium' | 'high' | 'critical'
type FilterTab      = 'all' | 'action_needed' | 'hot' | 'viewed' | 'sent' | 'accepted'

interface ProposalWithLead {
  id                  : string
  proposal_number     : string | null
  lead_id             : string | null
  client_name         : string | null
  client_phone        : string | null
  event_type          : string | null
  event_date          : string | null
  guest_count         : number | null
  package_name        : string | null
  total_price         : number | null
  status              : ProposalStatus
  urgency_score       : number | null
  risk_level          : RiskLevel | null
  next_action         : ProposalNextAction | null
  escalation_required : boolean | null
  engagement_score    : number | null
  viewed_count        : number | null
  sent_at             : string | null
  first_viewed_at     : string | null
  last_viewed_at      : string | null
  followed_up_at      : string | null
  created_at          : string
  updated_at          : string
  ai_summary          : string | null
  recommended_package : string | null
  venue_fit_reasoning : string | null
  urgency_cta         : string | null
  confidence_score    : number | null
  leads               : LeadSnapshotRaw | null
}

interface LeadSnapshotRaw {
  id               : string
  name             : string | null
  phone            : string | null
  ai_score         : number | null
  lead_temperature : string | null
  urgency_level    : string | null
  lead_stage       : string | null
  estimated_revenue: number | null
  budget           : string | null
  event_type       : string | null
  venue            : string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatINR(n: number): string {
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`
  if (n >= 1_000)   return `₹${(n / 1_000).toFixed(0)}K`
  return `₹${n}`
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 60)   return `${mins}m ago`
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`
  return `${Math.floor(mins / 1440)}d ago`
}

function toLeadSnapshot(raw: LeadSnapshotRaw | null): LeadSnapshot {
  return {
    id               : raw?.id               ?? '',
    name             : raw?.name             ?? null,
    phone            : raw?.phone            ?? null,
    email            : null,
    event_type       : raw?.event_type       ?? null,
    event_date       : null,
    guest_count      : null,
    budget           : raw?.budget           ?? null,
    venue            : raw?.venue            ?? null,
    ai_score         : raw?.ai_score         ?? null,
    lead_temperature : raw?.lead_temperature ?? null,
    urgency_level    : raw?.urgency_level    ?? null,
    lead_stage       : raw?.lead_stage       ?? null,
    estimated_revenue: raw?.estimated_revenue ?? null,
    score_breakdown  : null,
  }
}

function toProposalSnapshot(p: ProposalWithLead): ProposalSnapshot {
  return {
    id              : p.id,
    status          : p.status,
    total_price     : p.total_price,
    package_name    : p.package_name,
    guest_count     : p.guest_count,
    event_type      : p.event_type,
    sent_at         : p.sent_at,
    first_viewed_at : p.first_viewed_at,
    last_viewed_at  : p.last_viewed_at,
    followed_up_at  : p.followed_up_at,
    viewed_count    : p.viewed_count ?? 0,
    engagement_score: p.engagement_score ?? 0,
    created_at      : p.created_at,
  }
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ProposalStatus, { label: string; pill: string; icon: React.ElementType }> = {
  draft       : { label: 'Draft',       pill: 'bg-gray-100 text-gray-600 border border-gray-200',         icon: FileText      },
  generated   : { label: 'Generated',   pill: 'bg-blue-50 text-blue-700 border border-blue-200',          icon: Zap           },
  sent        : { label: 'Sent',        pill: 'bg-indigo-50 text-indigo-700 border border-indigo-200',    icon: Send          },
  viewed      : { label: 'Viewed',      pill: 'bg-amber-50 text-amber-700 border border-amber-200',       icon: Eye           },
  followed_up : { label: 'Followed Up', pill: 'bg-orange-50 text-orange-700 border border-orange-200',    icon: MessageSquare },
  accepted    : { label: 'Accepted',    pill: 'bg-emerald-50 text-emerald-700 border border-emerald-200', icon: CheckCircle2  },
  rejected    : { label: 'Rejected',    pill: 'bg-red-50 text-red-700 border border-red-200',             icon: XCircle       },
  expired     : { label: 'Expired',     pill: 'bg-gray-50 text-gray-400 border border-gray-200',          icon: Clock         },
}

const RISK_CONFIG: Record<RiskLevel, { label: string; color: string }> = {
  low     : { label: 'Low Risk',    color: 'text-emerald-600 bg-emerald-50 border border-emerald-200' },
  medium  : { label: 'Medium Risk', color: 'text-amber-600 bg-amber-50 border border-amber-200'       },
  high    : { label: 'High Risk',   color: 'text-orange-600 bg-orange-50 border border-orange-200'    },
  critical: { label: 'Critical',    color: 'text-red-700 bg-red-50 border border-red-200'             },
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusPill({ status }: { status: ProposalStatus }) {
  const cfg  = STATUS_CONFIG[status]
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.pill}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  )
}

function UrgencyBar({ score }: { score: number }) {
  const color = score >= 75 ? 'bg-red-500' : score >= 50 ? 'bg-amber-500' : score >= 25 ? 'bg-blue-500' : 'bg-gray-200'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-bold text-gray-600 tabular-nums w-6 text-right">{score}</span>
    </div>
  )
}

function EngagementDots({ count }: { count: number }) {
  const dots = Math.min(count, 5)
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={`w-2 h-2 rounded-full ${i < dots ? 'bg-blue-500' : 'bg-gray-200'}`}
          title={`${count} view${count !== 1 ? 's' : ''}`}
        />
      ))}
    </div>
  )
}

// ─── Intelligence panel ───────────────────────────────────────────────────────

function IntelligencePanel({
  proposal,
  urgency,
  onAction,
}: {
  proposal: ProposalWithLead
  urgency : ProposalUrgencyResult
  onAction: (action: string, proposalId: string) => void
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50/80 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-bold text-gray-900">Intelligence</span>
          {urgency.escalationRequired && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-red-600 text-white text-xs font-bold rounded animate-pulse">
              <AlertTriangle className="w-2.5 h-2.5" /> PRIORITY
            </span>
          )}
        </div>
        {urgency.riskLevel && (
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${RISK_CONFIG[urgency.riskLevel].color}`}>
            {RISK_CONFIG[urgency.riskLevel].label}
          </span>
        )}
      </div>

      <div className="px-4 py-3 space-y-3">
        <div>
          <p className="text-xs text-gray-400 mb-1 font-medium">URGENCY SCORE</p>
          <UrgencyBar score={urgency.urgencyScore} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gray-50 rounded-lg p-2.5">
            <p className="text-xs text-gray-400">Views</p>
            <div className="flex items-center gap-1.5 mt-1">
              <EngagementDots count={proposal.viewed_count ?? 0} />
              <span className="text-xs font-bold text-gray-700">{proposal.viewed_count ?? 0}</span>
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5">
            <p className="text-xs text-gray-400">Engagement</p>
            <p className="text-sm font-bold text-gray-700 mt-0.5">{proposal.engagement_score ?? 0}/100</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5">
            <p className="text-xs text-gray-400">Last Viewed</p>
            <p className="text-xs font-semibold text-gray-700 mt-0.5">{timeAgo(proposal.last_viewed_at)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5">
            <p className="text-xs text-gray-400">Since Sent</p>
            <p className={`text-xs font-semibold mt-0.5 ${urgency.hoursWithoutResponse && urgency.hoursWithoutResponse > 48 ? 'text-red-600' : 'text-gray-700'}`}>
              {urgency.hoursWithoutResponse !== null ? `${urgency.hoursWithoutResponse}h` : '—'}
            </p>
          </div>
        </div>

        {urgency.recommendation && (
          <div className="bg-blue-50 rounded-lg p-2.5 border border-blue-100">
            <p className="text-xs font-semibold text-blue-700 mb-0.5">Recommendation</p>
            <p className="text-xs text-blue-600">{urgency.recommendation}</p>
          </div>
        )}

        <button
          onClick={() => onAction(urgency.nextAction, proposal.id)}
          className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold border transition-colors ${
            urgency.urgencyScore >= 70
              ? 'bg-red-600 text-white border-red-700 hover:bg-red-700'
              : urgency.urgencyScore >= 40
              ? 'bg-amber-500 text-white border-amber-600 hover:bg-amber-600'
              : 'bg-blue-600 text-white border-blue-700 hover:bg-blue-700'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          {urgency.actionLabel}
        </button>
      </div>
    </div>
  )
}

// ─── Proposal card ────────────────────────────────────────────────────────────

function ProposalCard({
  proposal,
  onAction,
  onStatusUpdate,
}: {
  proposal      : ProposalWithLead
  onAction      : (action: string, proposalId: string) => void
  onStatusUpdate: (id: string, status: ProposalStatus) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const lead    = toLeadSnapshot(proposal.leads)
  const snap    = toProposalSnapshot(proposal)
  const urgency = computeProposalUrgency(snap, lead)
  const temp    = proposal.leads?.lead_temperature

  const borderColor =
    urgency.riskLevel === 'critical' ? 'border-l-red-500'  :
    urgency.riskLevel === 'high'     ? 'border-l-amber-500':
    urgency.riskLevel === 'medium'   ? 'border-l-blue-400' :
                                       'border-l-gray-200'

  return (
    <div className={`bg-white rounded-xl border border-gray-200 border-l-4 ${borderColor} overflow-hidden transition-shadow hover:shadow-md`}>
      {/* Card header */}
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-gray-900 truncate">
                {proposal.client_name ?? 'Unknown Client'}
              </span>
              {proposal.proposal_number && (
                <span className="text-xs text-gray-400 font-mono">{proposal.proposal_number}</span>
              )}
              {temp === 'HOT' && (
                <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-red-600">
                  <Flame className="w-3 h-3" /> HOT
                </span>
              )}
              {urgency.escalationRequired && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-red-600 text-white text-xs font-bold rounded">
                  <AlertTriangle className="w-2.5 h-2.5" /> PRIORITY
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <StatusPill status={proposal.status} />
              {proposal.event_type && (
                <span className="text-xs text-gray-500 capitalize">{proposal.event_type}</span>
              )}
              {proposal.event_date && (
                <span className="text-xs text-gray-400">
                  {new Date(proposal.event_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              )}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            {proposal.total_price && (
              <p className="text-base font-black text-gray-900">{formatINR(proposal.total_price)}</p>
            )}
            {proposal.guest_count && (
              <p className="text-xs text-gray-400">{proposal.guest_count} guests</p>
            )}
          </div>
        </div>

        <div className="mb-2">
          <UrgencyBar score={urgency.urgencyScore} />
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-500">
          {proposal.sent_at && (
            <span className="flex items-center gap-1">
              <Send className="w-3 h-3" /> {timeAgo(proposal.sent_at)}
            </span>
          )}
          {proposal.viewed_count !== null && proposal.viewed_count > 0 && (
            <span className="flex items-center gap-1 text-blue-600 font-medium">
              <Eye className="w-3 h-3" /> {proposal.viewed_count} view{proposal.viewed_count !== 1 ? 's' : ''}
            </span>
          )}
          {proposal.last_viewed_at && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> last {timeAgo(proposal.last_viewed_at)}
            </span>
          )}
        </div>
      </div>

      {/* Action strip */}
      <div className="px-4 py-2 bg-gray-50/60 border-t border-gray-100 flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => onAction('send_via_whatsapp', proposal.id)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-semibold hover:bg-green-100 transition-colors"
        >
          <MessageSquare className="w-3 h-3" /> WhatsApp
        </button>
        <button
          onClick={() => onAction('send_via_email', proposal.id)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold hover:bg-blue-100 transition-colors"
        >
          <Mail className="w-3 h-3" /> Email
        </button>
        <button
          onClick={() => window.open(`/api/proposals/${proposal.id}/pdf`, '_blank')}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-xs font-semibold hover:bg-purple-100 transition-colors"
        >
          <Download className="w-3 h-3" /> PDF
        </button>
        <button
          onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/proposals/share/${proposal.id}`); alert('Share link copied!') }}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 text-gray-600 border border-gray-200 rounded-lg text-xs font-semibold hover:bg-gray-200 transition-colors"
        >
          <Copy className="w-3 h-3" /> Copy Link
        </button>
        {proposal.status !== 'accepted' && (
          <button
            onClick={() => onStatusUpdate(proposal.id, 'accepted')}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold hover:bg-emerald-100 transition-colors ml-auto"
          >
            <CheckCircle2 className="w-3 h-3" /> Mark Accepted
          </button>
        )}
        <button
          onClick={() => setExpanded((p) => !p)}
          className="ml-auto p-1 text-gray-400 hover:text-gray-600"
          title="Toggle intelligence panel"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Intelligence panel — expandable */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-4">
          <IntelligencePanel proposal={proposal} urgency={urgency} onAction={onAction} />
          <div className="space-y-3">
            {proposal.ai_summary && (
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">AI Summary</p>
                <p className="text-sm text-gray-700 leading-relaxed">{proposal.ai_summary}</p>
              </div>
            )}
            {proposal.venue_fit_reasoning && (
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Venue Fit</p>
                <p className="text-sm text-gray-600">{proposal.venue_fit_reasoning}</p>
              </div>
            )}
            {proposal.urgency_cta && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs font-bold text-amber-700 mb-1">Urgency Message</p>
                <p className="text-xs text-amber-600">{proposal.urgency_cta}</p>
              </div>
            )}
            {proposal.client_phone && (
              <a
                href={`tel:${proposal.client_phone}`}
                className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-200 transition-colors w-full justify-center"
              >
                <Phone className="w-3.5 h-3.5" />
                Call {proposal.client_name ?? 'Client'}
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProposalsPage() {
  const [proposals,    setProposals]    = useState<ProposalWithLead[]>([])
  const [loading,      setLoading]      = useState(true)
  const [filter,       setFilter]       = useState<FilterTab>('all')
  const [search,       setSearch]       = useState('')
  const [sortBy,       setSortBy]       = useState<'urgency' | 'created' | 'value'>('urgency')
  const [lastRefresh,  setLastRefresh]  = useState<Date>(new Date())

  const fetchProposals = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/proposals/intelligence')
      const data = await res.json() as { proposals?: ProposalWithLead[] }
      setProposals(Array.isArray(data) ? data : data.proposals ?? [])
      setLastRefresh(new Date())
    } catch (err) {
      console.error('[Proposals] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProposals()
  }, [fetchProposals])

  async function handleStatusUpdate(id: string, status: ProposalStatus) {
    try {
      await fetch(`/api/proposals`, {
        method : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ id, status, ...(status === 'accepted' ? { accepted_at: new Date().toISOString() } : {}) }),
      })
      setProposals((prev) => prev.map((p) => p.id === id ? { ...p, status } : p))
    } catch (err) {
      console.error('[Proposals] status update error:', err)
    }
  }

  function handleAction(action: string, proposalId: string) {
    const proposal = proposals.find((p) => p.id === proposalId)
    if (!proposal) return

    if (action === 'send_via_whatsapp' && proposal.client_phone) {
      const msg = encodeURIComponent(`Dear ${proposal.client_name ?? 'Sir/Ma\'am'}, please find your proposal from BookMySpaces: ${window.location.origin}/proposals/share/${proposalId}`)
      window.open(`https://wa.me/${proposal.client_phone.replace(/\D/g, '')}?text=${msg}`, '_blank')
      handleStatusUpdate(proposalId, 'sent')
    } else if (action === 'send_via_email' && proposal.client_phone) {
      window.open(`mailto:?subject=Proposal from BookMySpaces&body=Please find your event proposal: ${window.location.origin}/proposals/share/${proposalId}`, '_blank')
      handleStatusUpdate(proposalId, 'sent')
    } else if (action === 'follow_up_now') {
      handleStatusUpdate(proposalId, 'followed_up')
    } else if (action === 'mark_accepted') {
      handleStatusUpdate(proposalId, 'accepted')
    } else if (action === 'escalate_to_sales') {
      alert(`Escalated: ${proposal.client_name} — ${proposal.proposal_number}`)
    }
  }

  // Derived stats
  const actionNeededCount = proposals.filter((p) => {
    const u = computeProposalUrgency(toProposalSnapshot(p), toLeadSnapshot(p.leads))
    return u.followUpRequired || u.resendRecommended || u.escalationRequired
  }).length
  const totalValue    = proposals.reduce((s, p) => s + (p.total_price ?? 0), 0)
  const acceptedValue = proposals.filter((p) => p.status === 'accepted').reduce((s, p) => s + (p.total_price ?? 0), 0)

  // Filter + sort
  const displayed = proposals
    .filter((p) => {
      const u = computeProposalUrgency(toProposalSnapshot(p), toLeadSnapshot(p.leads))
      const matchesFilter =
        filter === 'all'           ? true :
        filter === 'action_needed' ? (u.followUpRequired || u.resendRecommended || u.escalationRequired) :
        filter === 'hot'           ? p.leads?.lead_temperature === 'HOT' :
        filter === 'viewed'        ? p.status === 'viewed' :
        filter === 'sent'          ? p.status === 'sent' :
        filter === 'accepted'      ? p.status === 'accepted' :
        true

      const matchesSearch = !search || [p.client_name, p.client_phone, p.event_type, p.proposal_number]
        .some((f) => f?.toLowerCase().includes(search.toLowerCase()))

      return matchesFilter && matchesSearch
    })
    .sort((a, b) => {
      if (sortBy === 'urgency') return (b.urgency_score ?? 0) - (a.urgency_score ?? 0)
      if (sortBy === 'value')   return (b.total_price ?? 0) - (a.total_price ?? 0)
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

  const FILTER_TABS: { id: FilterTab; label: string; count?: number }[] = [
    { id: 'all',           label: 'All',             count: proposals.length    },
    { id: 'action_needed', label: '⚡ Action Needed', count: actionNeededCount  },
    { id: 'hot',           label: '🔥 HOT Leads'                                },
    { id: 'viewed',        label: '👁 Viewed'                                   },
    { id: 'sent',          label: '📨 Sent'                                     },
    { id: 'accepted',      label: '✅ Accepted'                                 },
  ]

  return (
    <div className="min-h-screen bg-gray-50/60">

      {/* ── Header ── */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-200 px-6 py-3">
        <div className="max-w-screen-xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-black text-gray-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              Proposal Intelligence
            </h1>
            <p className="text-xs text-gray-400">
              {proposals.length} proposals · {actionNeededCount} need action · {lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {actionNeededCount > 0 && (
              <button
                onClick={() => setFilter('action_needed')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold animate-pulse hover:bg-red-700"
              >
                <AlertTriangle className="w-3.5 h-3.5" /> {actionNeededCount} need action
              </button>
            )}
            <button
              onClick={fetchProposals}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            {/* ── NEW PROPOSAL BUTTON ── */}
            <Link
              href="/proposals/new"
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> New Proposal
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-screen-xl mx-auto px-6 py-5 space-y-5">

        {/* ── KPI strip ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Proposals', value: proposals.length,        icon: FileText,      color: 'bg-gray-100 text-gray-600'    },
            { label: 'Action Needed',   value: actionNeededCount,        icon: AlertTriangle, color: 'bg-red-100 text-red-600'      },
            { label: 'Pipeline Value',  value: formatINR(totalValue),    icon: TrendingUp,    color: 'bg-blue-100 text-blue-600'    },
            { label: 'Won Revenue',     value: formatINR(acceptedValue), icon: CheckCircle2,  color: 'bg-emerald-100 text-emerald-600' },
          ].map((card) => (
            <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between mb-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{card.label}</p>
                <div className={`p-1.5 rounded-xl ${card.color}`}><card.icon className="w-4 h-4" /></div>
              </div>
              <p className="text-2xl font-black text-gray-900">{card.value}</p>
            </div>
          ))}
        </div>

        {/* ── Filters + search ── */}
        <div className="bg-white rounded-2xl border border-gray-200 px-4 py-3">
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            {FILTER_TABS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filter === f.id ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {f.label}
                {f.count !== undefined && (
                  <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${filter === f.id ? 'bg-white/25 text-white' : 'bg-gray-200 text-gray-500'}`}>
                    {f.count}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Client, phone, event..."
                className="pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-xs w-44 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
              />
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              <Filter className="w-3.5 h-3.5 text-gray-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="border border-gray-200 rounded-lg text-xs px-2 py-2 focus:outline-none bg-gray-50"
              >
                <option value="urgency">Sort: Urgency</option>
                <option value="value">Sort: Value</option>
                <option value="created">Sort: Newest</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── Proposal cards ── */}
        {loading ? (
          <div className="flex justify-center py-16">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
            <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-gray-500">No proposals match the current filter</p>
            <button
              onClick={() => { setFilter('all'); setSearch('') }}
              className="mt-3 text-xs text-blue-600 hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {displayed.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                onAction={handleAction}
                onStatusUpdate={handleStatusUpdate}
              />
            ))}
          </div>
        )}

        {displayed.length > 0 && (
          <p className="text-xs text-gray-400 text-center py-2">
            {displayed.length} of {proposals.length} proposals · {formatINR(displayed.reduce((s, p) => s + (p.total_price ?? 0), 0))} total value
          </p>
        )}

      </div>
    </div>
  )
}
