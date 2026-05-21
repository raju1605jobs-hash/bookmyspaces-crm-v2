'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Flame,
  Thermometer,
  Snowflake,
  AlertTriangle,
  Clock,
  TrendingUp,
  Users,
  DollarSign,
  RefreshCw,
  ChevronDown,
  Phone,
  Calendar,
  Tag,
  Search,
  Filter,
} from 'lucide-react'
import { Lead, LeadStage, LeadTemperature, DashboardSummary, LEAD_STAGES } from '@/modules/leads/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface HotLeadsResponse {
  leads: Lead[]
  total: number
}

// ─── Stage config ─────────────────────────────────────────────────────────────

const STAGE_CONFIG: Record<LeadStage, { label: string; color: string }> = {
  NEW            : { label: 'New',            color: 'bg-gray-100 text-gray-700' },
  CONTACTED      : { label: 'Contacted',      color: 'bg-blue-100 text-blue-700' },
  QUALIFIED      : { label: 'Qualified',      color: 'bg-indigo-100 text-indigo-700' },
  NEGOTIATING    : { label: 'Negotiating',    color: 'bg-yellow-100 text-yellow-700' },
  PROPOSAL_SENT  : { label: 'Proposal Sent',  color: 'bg-purple-100 text-purple-700' },
  VISIT_SCHEDULED: { label: 'Visit Booked',   color: 'bg-orange-100 text-orange-700' },
  CONFIRMED      : { label: 'Confirmed',      color: 'bg-green-100 text-green-700' },
  LOST           : { label: 'Lost',           color: 'bg-red-100 text-red-700' },
}

const TEMP_CONFIG: Record<LeadTemperature, { icon: React.ElementType; color: string; label: string }> = {
  HOT : { icon: Flame,       color: 'text-red-600',    label: 'HOT'  },
  WARM: { icon: Thermometer, color: 'text-orange-500', label: 'WARM' },
  COLD: { icon: Snowflake,   color: 'text-blue-500',   label: 'COLD' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatINR(amount: number): string {
  if (amount >= 100_000) return `₹${(amount / 100_000).toFixed(1)}L`
  if (amount >= 1_000)   return `₹${(amount / 1_000).toFixed(0)}K`
  return `₹${amount}`
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 60)  return `${mins}m ago`
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`
  return `${Math.floor(mins / 1440)}d ago`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label  : string
  value  : string | number
  sub   ?: string
  icon   : React.ElementType
  accent : string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <div className={`p-2 rounded-lg ${accent}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

function StageBadge({ stage }: { stage: LeadStage | null }) {
  if (!stage) return <span className="text-xs text-gray-400">—</span>
  const cfg = STAGE_CONFIG[stage]
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      {cfg.label}
    </span>
  )
}

function TempIcon({ temp }: { temp: LeadTemperature | null }) {
  if (!temp) return null
  const cfg = TEMP_CONFIG[temp]
  const Icon = cfg.icon
  return <Icon className={`w-4 h-4 ${cfg.color}`} />
}

function LeadRow({
  lead,
  onStageChange,
}: {
  lead         : Lead
  onStageChange: (id: string, stage: LeadStage) => void
}) {
  const [stageDdOpen, setStageDdOpen] = useState(false)
  const [updating, setUpdating]       = useState(false)

  async function handleStageSelect(newStage: LeadStage) {
    setStageDdOpen(false)
    if (newStage === lead.lead_stage) return
    setUpdating(true)
    try {
      const res = await fetch(`/api/leads/${lead.id}/stage`, {
        method : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ stage: newStage, reason: 'dashboard update' }),
      })
      if (res.ok) onStageChange(lead.id, newStage)
    } finally {
      setUpdating(false)
    }
  }

  return (
    <tr className={`hover:bg-gray-50 transition-colors ${lead.escalation_required ? 'bg-red-50/40' : ''}`}>
      {/* Temperature */}
      <td className="px-4 py-3 w-8">
        <TempIcon temp={lead.lead_temperature} />
      </td>

      {/* Contact */}
      <td className="px-4 py-3">
        <div className="flex items-start gap-2">
          <div>
            <p className="text-sm font-medium text-gray-900 flex items-center gap-1">
              {lead.name ?? 'Unknown'}
              {lead.escalation_required && (
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
              )}
            </p>
            {lead.phone && (
              <a
                href={`tel:${lead.phone}`}
                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
              >
                <Phone className="w-3 h-3" />
                {lead.phone}
              </a>
            )}
          </div>
        </div>
      </td>

      {/* Event */}
      <td className="px-4 py-3">
        <p className="text-sm text-gray-700 capitalize">{lead.event_type ?? '—'}</p>
        {lead.event_date && (
          <p className="text-xs text-gray-400 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {new Date(lead.event_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
        )}
      </td>

      {/* Guests */}
      <td className="px-4 py-3 text-sm text-center text-gray-700">
        {lead.guest_count ?? '—'}
      </td>

      {/* Score */}
      <td className="px-4 py-3 text-center">
        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${
          (lead.ai_score ?? 0) >= 80 ? 'bg-red-100 text-red-700'    :
          (lead.ai_score ?? 0) >= 60 ? 'bg-orange-100 text-orange-700' :
                                       'bg-gray-100 text-gray-600'
        }`}>
          {lead.ai_score ?? '—'}
        </span>
      </td>

      {/* Revenue */}
      <td className="px-4 py-3 text-sm text-gray-700 text-right">
        {lead.estimated_revenue ? formatINR(lead.estimated_revenue) : '—'}
      </td>

      {/* Stage (editable) */}
      <td className="px-4 py-3">
        <div className="relative">
          <button
            onClick={() => setStageDdOpen((p) => !p)}
            disabled={updating}
            className="flex items-center gap-1"
          >
            <StageBadge stage={lead.lead_stage} />
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </button>

          {stageDdOpen && (
            <div className="absolute z-20 top-full left-0 mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1">
              {LEAD_STAGES.map((s) => (
                <button
                  key={s}
                  onClick={() => handleStageSelect(s)}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${
                    s === lead.lead_stage ? 'font-semibold text-blue-600' : 'text-gray-700'
                  }`}
                >
                  {STAGE_CONFIG[s].label}
                </button>
              ))}
            </div>
          )}
        </div>
      </td>

      {/* Last contact */}
      <td className="px-4 py-3 text-xs text-gray-400">
        {lead.last_contacted_at ? timeAgo(lead.last_contacted_at) : 'Never'}
      </td>

      {/* Tags */}
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1 max-w-32">
          {(lead.tags ?? []).slice(0, 3).map((tag) => (
            <span key={tag} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
              <Tag className="w-2.5 h-2.5" />
              {tag}
            </span>
          ))}
        </div>
      </td>
    </tr>
  )
}

// ─── Main Dashboard Page ──────────────────────────────────────────────────────

type FilterType = 'all' | 'hot' | 'escalations' | 'stale' | 'follow_up_due' | 'confirmed' | 'lost'

export default function HotLeadDashboard() {
  const [summary, setSummary]   = useState<DashboardSummary | null>(null)
  const [leads, setLeads]       = useState<Lead[]>([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState<FilterType>('hot')
  const [stageFilter, setStageFilter] = useState<LeadStage | 'ALL'>('ALL')
  const [search, setSearch]     = useState('')
  const [sortBy, setSortBy]     = useState<'score' | 'revenue' | 'created'>('score')
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [statsRes, leadsRes] = await Promise.all([
        fetch('/api/dashboard/stats'),
        fetch('/api/leads/hot'),
      ])

      if (statsRes.ok) {
        const data = await statsRes.json() as DashboardSummary
        setSummary(data)
      }

      if (leadsRes.ok) {
        const data = await leadsRes.json() as HotLeadsResponse
        setLeads(Array.isArray(data) ? data : data.leads ?? [])
      }

      setLastRefresh(new Date())
    } catch {
      // Silently fail — show stale data
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 60_000)
    return () => clearInterval(interval)
  }, [fetchData])

  function handleStageChange(id: string, newStage: LeadStage) {
    setLeads((prev) => prev.map((l) => l.id === id ? { ...l, lead_stage: newStage } : l))
  }

  // Client-side filter + sort
  const displayed = leads
    .filter((l) => {
      const matchesFilter =
        filter === 'all'          ? true :
        filter === 'hot'          ? l.lead_temperature === 'HOT' :
        filter === 'escalations'  ? l.escalation_required :
        filter === 'stale'        ? (l.lead_temperature === 'HOT' && l.last_contacted_at && (Date.now() - new Date(l.last_contacted_at).getTime()) > 4 * 3_600_000) :
        filter === 'follow_up_due'? (l.next_follow_up_at && new Date(l.next_follow_up_at) <= new Date()) :
        filter === 'confirmed'    ? l.lead_stage === 'CONFIRMED' :
        filter === 'lost'         ? l.lead_stage === 'LOST' :
        true

      const matchesStage = stageFilter === 'ALL' || l.lead_stage === stageFilter

      const matchesSearch = !search || [l.name, l.phone, l.event_type, l.email]
        .some((f) => f?.toLowerCase().includes(search.toLowerCase()))

      return matchesFilter && matchesStage && matchesSearch
    })
    .sort((a, b) =>
      sortBy === 'score'   ? (b.ai_score ?? 0) - (a.ai_score ?? 0) :
      sortBy === 'revenue' ? (b.estimated_revenue ?? 0) - (a.estimated_revenue ?? 0) :
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

  const QUICK_FILTERS: { id: FilterType; label: string; count?: number }[] = [
    { id: 'hot',          label: '🔥 HOT',             count: summary?.hot_leads },
    { id: 'escalations',  label: '🚨 Escalations',     count: summary?.escalations_pending },
    { id: 'stale',        label: '⏰ Stale HOT',       count: summary?.stale_hot_leads },
    { id: 'follow_up_due',label: '📤 Follow-up Due',   count: summary?.follow_ups_due },
    { id: 'confirmed',    label: '✅ Confirmed'         },
    { id: 'lost',         label: '❌ Lost'              },
    { id: 'all',          label: 'All Leads'            },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-screen-xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Sales Dashboard</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Last updated {lastRefresh.toLocaleTimeString('en-IN')}
            </p>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-6 py-6 space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Pipeline"
            value={summary ? formatINR(summary.total_pipeline_value) : '—'}
            sub={`${summary?.total_leads ?? 0} leads`}
            icon={TrendingUp}
            accent="bg-blue-50 text-blue-600"
          />
          <StatCard
            label="HOT Leads"
            value={summary?.hot_leads ?? '—'}
            sub={`${summary?.stale_hot_leads ?? 0} stale`}
            icon={Flame}
            accent="bg-red-50 text-red-600"
          />
          <StatCard
            label="Escalations"
            value={summary?.escalations_pending ?? '—'}
            sub="Needs human attention"
            icon={AlertTriangle}
            accent="bg-yellow-50 text-yellow-600"
          />
          <StatCard
            label="Confirmed Revenue"
            value={summary ? formatINR(summary.confirmed_revenue) : '—'}
            sub={`${summary?.conversion_rate ?? 0}% conversion`}
            icon={DollarSign}
            accent="bg-green-50 text-green-600"
          />
        </div>

        {/* Pipeline bar */}
        {summary?.pipeline && summary.pipeline.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Pipeline Distribution</h2>
            <div className="flex gap-2 flex-wrap">
              {summary.pipeline.map((row) => (
                <div
                  key={`${row.lead_stage}-${row.lead_temperature}`}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg"
                >
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STAGE_CONFIG[row.lead_stage]?.color ?? 'bg-gray-100 text-gray-600'}`}>
                    {STAGE_CONFIG[row.lead_stage]?.label ?? row.lead_stage}
                  </span>
                  <span className="text-sm font-bold text-gray-900">{row.lead_count}</span>
                  <span className="text-xs text-gray-400">{formatINR(row.total_pipeline_value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filter bar */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {QUICK_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filter === f.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f.label}
                {f.count !== undefined && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    filter === f.id ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {f.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search leads..."
                className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm w-52 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Stage filter */}
            <div className="relative flex items-center gap-1">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value as LeadStage | 'ALL')}
                className="border border-gray-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">All stages</option>
                {LEAD_STAGES.map((s) => (
                  <option key={s} value={s}>{STAGE_CONFIG[s].label}</option>
                ))}
              </select>
            </div>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="border border-gray-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="score">Sort: AI Score</option>
              <option value="revenue">Sort: Revenue</option>
              <option value="created">Sort: Newest</option>
            </select>
          </div>
        </div>

        {/* Leads table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-gray-500" />
              <h2 className="text-sm font-semibold text-gray-900">
                {displayed.length} lead{displayed.length !== 1 ? 's' : ''}
              </h2>
            </div>
            {loading && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin" /> Loading...
              </span>
            )}
          </div>

          {displayed.length === 0 ? (
            <div className="text-center py-16">
              <Clock className="w-8 h-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No leads match the current filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-3 w-8" />
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Contact</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Event</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">Guests</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">Score</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Revenue</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Stage</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Last Contact</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Tags</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {displayed.map((lead) => (
                    <LeadRow key={lead.id} lead={lead} onStageChange={handleStageChange} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
