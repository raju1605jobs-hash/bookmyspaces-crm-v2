'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
  ChevronUp,
  Phone,
  Calendar,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Target,
  Zap,
  ArrowUpRight,
} from 'lucide-react'
import {
  Lead,
  LeadStage,
  LeadTemperature,
  DashboardSummary,
  LEAD_STAGES,
} from '@/modules/leads/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface HotLeadsResponse {
  leads: Lead[]
  total: number
}

type SortField   = 'priority' | 'score' | 'revenue' | 'created'
type FilterType  = 'all' | 'hot' | 'escalations' | 'qualified' | 'stale' | 'follow_up_due' | 'confirmed' | 'lost'
type SortDir     = 'asc' | 'desc'

// ─── Stage config ─────────────────────────────────────────────────────────────

const STAGE_CONFIG: Record<LeadStage, { label: string; pill: string; dot: string }> = {
  NEW            : { label: 'New',           pill: 'bg-gray-100 text-gray-700 border border-gray-200',          dot: 'bg-gray-400'   },
  CONTACTED      : { label: 'Contacted',     pill: 'bg-blue-50 text-blue-700 border border-blue-200',           dot: 'bg-blue-500'   },
  QUALIFIED      : { label: 'Qualified',     pill: 'bg-indigo-50 text-indigo-700 border border-indigo-200',     dot: 'bg-indigo-500' },
  NEGOTIATING    : { label: 'Negotiating',   pill: 'bg-amber-50 text-amber-700 border border-amber-200',        dot: 'bg-amber-500'  },
  PROPOSAL_SENT  : { label: 'Proposal Sent', pill: 'bg-purple-50 text-purple-700 border border-purple-200',     dot: 'bg-purple-500' },
  VISIT_SCHEDULED: { label: 'Visit Booked',  pill: 'bg-orange-50 text-orange-700 border border-orange-200',     dot: 'bg-orange-500' },
  CONFIRMED      : { label: 'Confirmed',     pill: 'bg-emerald-50 text-emerald-700 border border-emerald-200',  dot: 'bg-emerald-500'},
  LOST           : { label: 'Lost',          pill: 'bg-red-50 text-red-700 border border-red-200',              dot: 'bg-red-400'    },
}

const TEMP_CONFIG: Record<LeadTemperature, {
  icon : React.ElementType
  badge: string
  label: string
  row  : string
}> = {
  HOT : { icon: Flame,       badge: 'bg-red-100 text-red-700 border border-red-200',          label: '🔥 HOT',  row: 'hover:bg-red-50/30'    },
  WARM: { icon: Thermometer, badge: 'bg-amber-100 text-amber-700 border border-amber-200',    label: '🌤 WARM', row: 'hover:bg-amber-50/20'  },
  COLD: { icon: Snowflake,   badge: 'bg-sky-100 text-sky-700 border border-sky-200',          label: '❄️ COLD', row: 'hover:bg-sky-50/20'    },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatINR(amount: number): string {
  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(1)}Cr`
  if (amount >= 100_000)    return `₹${(amount / 100_000).toFixed(1)}L`
  if (amount >= 1_000)      return `₹${(amount / 1_000).toFixed(0)}K`
  return `₹${amount}`
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 1)    return 'just now'
  if (mins < 60)   return `${mins}m ago`
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`
  return `${Math.floor(mins / 1440)}d ago`
}

// Priority sort value — escalated HOT > qualified > high score > newest
function priorityValue(lead: Lead): number {
  let v = 0
  if (lead.escalation_required && lead.lead_temperature === 'HOT') v += 10000
  else if (lead.escalation_required)                                v += 5000
  if (lead.lead_stage === 'QUALIFIED')                              v += 2000
  else if (lead.lead_stage === 'NEGOTIATING')                       v += 1500
  else if (lead.lead_stage === 'PROPOSAL_SENT')                     v += 1200
  v += (lead.ai_score ?? 0) * 10
  v += lead.lead_temperature === 'HOT' ? 500 : lead.lead_temperature === 'WARM' ? 200 : 0
  return v
}

// ─── AI Score Badge ───────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-gray-300">—</span>
  const cls =
    score >= 80 ? 'bg-red-600 text-white'       :
    score >= 60 ? 'bg-amber-500 text-white'      :
    score >= 40 ? 'bg-blue-500 text-white'       :
                  'bg-gray-200 text-gray-600'
  return (
    <span className={`inline-flex items-center justify-center w-9 h-7 rounded-lg text-xs font-bold tabular-nums ${cls}`}>
      {score}
    </span>
  )
}

// ─── Temperature Badge ────────────────────────────────────────────────────────

function TempBadge({ temp }: { temp: LeadTemperature | null }) {
  if (!temp) return null
  const cfg = TEMP_CONFIG[temp]
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${cfg.badge}`}>
      <Icon className="w-3 h-3" />
      {temp}
    </span>
  )
}

// ─── Stage Pill ───────────────────────────────────────────────────────────────

function StagePill({ stage }: { stage: LeadStage | null }) {
  if (!stage) return <span className="text-xs text-gray-300">—</span>
  const cfg = STAGE_CONFIG[stage]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border ${cfg.pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

// ─── Escalation Badge ─────────────────────────────────────────────────────────

function EscalationBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-red-600 text-white text-xs font-bold rounded animate-pulse">
      <AlertTriangle className="w-3 h-3" />
      PRIORITY
    </span>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  highlight,
}: {
  label     : string
  value     : string | number
  sub      ?: string
  icon      : React.ElementType
  accent    : string
  highlight?: boolean
}) {
  return (
    <div className={`bg-white rounded-2xl border p-5 transition-shadow hover:shadow-md ${
      highlight ? 'border-red-200 ring-1 ring-red-100' : 'border-gray-200'
    }`}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{label}</p>
        <div className={`p-2 rounded-xl ${accent}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className={`text-2xl font-black tracking-tight ${highlight ? 'text-red-600' : 'text-gray-900'}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-1.5 font-medium">{sub}</p>}
    </div>
  )
}

// ─── Pipeline Stage Card ──────────────────────────────────────────────────────

function PipelineCard({
  stage,
  count,
  revenue,
  onClick,
  active,
}: {
  stage  : LeadStage
  count  : number
  revenue: number
  onClick: () => void
  active : boolean
}) {
  const cfg = STAGE_CONFIG[stage]
  return (
    <button
      onClick={onClick}
      className={`flex-1 min-w-[7rem] flex flex-col gap-1 px-3 py-3 rounded-xl border text-left transition-all hover:shadow-sm ${
        active
          ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-200'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-md border w-fit ${cfg.pill}`}>
        {cfg.label}
      </span>
      <p className="text-xl font-black text-gray-900 tabular-nums">{count}</p>
      <p className="text-xs text-gray-400 font-medium">{revenue > 0 ? formatINR(revenue) : 'No revenue'}</p>
    </button>
  )
}

// ─── Stage Dropdown ───────────────────────────────────────────────────────────

function StageDropdown({
  lead,
  onStageChange,
}: {
  lead         : Lead
  onStageChange: (id: string, stage: LeadStage) => void
}) {
  const [open, setOpen]         = useState(false)
  const [updating, setUpdating] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function handleSelect(newStage: LeadStage) {
    setOpen(false)
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
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((p) => !p)}
        disabled={updating}
        className="flex items-center gap-1 group"
        title="Change stage"
      >
        <StagePill stage={lead.lead_stage} />
        {updating
          ? <RefreshCw className="w-3 h-3 text-gray-400 animate-spin" />
          : <ChevronDown className="w-3 h-3 text-gray-300 group-hover:text-gray-500" />
        }
      </button>

      {open && (
        <div className="absolute z-30 top-full left-0 mt-1 w-44 bg-white rounded-xl shadow-lg border border-gray-200 py-1 overflow-hidden">
          {LEAD_STAGES.map((s) => (
            <button
              key={s}
              onClick={() => handleSelect(s)}
              className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-gray-50 ${
                s === lead.lead_stage ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${STAGE_CONFIG[s].dot}`} />
              {STAGE_CONFIG[s].label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Lead Row ─────────────────────────────────────────────────────────────────

function LeadRow({
  lead,
  onStageChange,
}: {
  lead         : Lead
  onStageChange: (id: string, stage: LeadStage) => void
}) {
  const temp    = lead.lead_temperature
  const rowBase = temp ? TEMP_CONFIG[temp].row : 'hover:bg-gray-50'
  const isHot   = temp === 'HOT'
  const isEsc   = lead.escalation_required

  return (
    <tr className={`transition-colors border-b border-gray-50 last:border-0 ${rowBase} ${
      isEsc && isHot ? 'bg-red-50/40' : ''
    }`}>

      {/* Priority indicator column */}
      <td className="pl-4 pr-2 py-3 w-6">
        {isEsc && (
          <div className="w-1 h-8 rounded-full bg-red-500 mx-auto" title="Escalated" />
        )}
      </td>

      {/* Temperature badge */}
      <td className="px-3 py-3 whitespace-nowrap">
        <TempBadge temp={lead.lead_temperature} />
      </td>

      {/* Contact */}
      <td className="px-3 py-3 min-w-[140px]">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-gray-900 leading-tight">
              {lead.name ?? 'Unknown'}
            </span>
            {isEsc && <EscalationBadge />}
          </div>
          {lead.phone && (
            <a
              href={`tel:${lead.phone}`}
              className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1 w-fit"
            >
              <Phone className="w-3 h-3" />
              {lead.phone}
            </a>
          )}
        </div>
      </td>

      {/* Event */}
      <td className="px-3 py-3 min-w-[120px]">
        <p className="text-sm text-gray-800 capitalize font-medium">{lead.event_type ?? '—'}</p>
        {lead.event_date && (
          <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
            <Calendar className="w-3 h-3" />
            {new Date(lead.event_date).toLocaleDateString('en-IN', {
              day: '2-digit', month: 'short', year: 'numeric',
            })}
          </p>
        )}
      </td>

      {/* Guests */}
      <td className="px-3 py-3 text-center whitespace-nowrap">
        <span className="text-sm font-semibold text-gray-700 tabular-nums">
          {lead.guest_count ? `${lead.guest_count}` : '—'}
        </span>
      </td>

      {/* AI Score */}
      <td className="px-3 py-3 text-center whitespace-nowrap">
        <ScoreBadge score={lead.ai_score ?? null} />
      </td>

      {/* Revenue */}
      <td className="px-3 py-3 text-right whitespace-nowrap">
        <span className="text-sm font-bold text-gray-800 tabular-nums">
          {lead.estimated_revenue ? formatINR(lead.estimated_revenue) : '—'}
        </span>
      </td>

      {/* Stage — editable dropdown */}
      <td className="px-3 py-3 whitespace-nowrap">
        <StageDropdown lead={lead} onStageChange={onStageChange} />
      </td>

      {/* Last contact */}
      <td className="px-3 py-3 whitespace-nowrap">
        <span className="text-xs text-gray-400">
          {lead.last_contacted_at ? timeAgo(lead.last_contacted_at) : 'Never'}
        </span>
      </td>

      {/* Source */}
      <td className="px-3 py-3 pr-4 whitespace-nowrap">
        <span className="text-xs text-gray-400 capitalize">{lead.source ?? '—'}</span>
      </td>
    </tr>
  )
}

// ─── Sort Header ──────────────────────────────────────────────────────────────

function SortTh({
  label,
  field,
  current,
  dir,
  onSort,
  align = 'left',
}: {
  label  : string
  field  : SortField
  current: SortField
  dir    : SortDir
  onSort : (f: SortField) => void
  align ?: 'left' | 'center' | 'right'
}) {
  const active = current === field
  const Icon   = active && dir === 'asc' ? ChevronUp : ChevronDown
  return (
    <th
      className={`px-3 py-3 text-xs font-semibold uppercase tracking-wide cursor-pointer select-none whitespace-nowrap group text-${align} ${
        active ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
      }`}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <Icon className={`w-3 h-3 ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'}`} />
      </span>
    </th>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function SalesOperationsDashboard() {
  const [summary, setSummary]           = useState<DashboardSummary | null>(null)
  const [leads, setLeads]               = useState<Lead[]>([])
  const [loading, setLoading]           = useState(true)
  const [filter, setFilter]             = useState<FilterType>('all')
  const [stageFilter, setStageFilter]   = useState<LeadStage | 'ALL'>('ALL')
  const [search, setSearch]             = useState('')
  const [sortBy, setSortBy]             = useState<SortField>('priority')
  const [sortDir, setSortDir]           = useState<SortDir>('desc')
  const [lastRefresh, setLastRefresh]   = useState<Date>(new Date())

  // Stage pipeline counts derived from leads (no extra API call)
  const stageCounts = LEAD_STAGES.reduce<Record<LeadStage, { count: number; revenue: number }>>(
    (acc, s) => {
      const stageLeads = leads.filter((l) => l.lead_stage === s)
      acc[s] = {
        count  : stageLeads.length,
        revenue: stageLeads.reduce((sum, l) => sum + (l.estimated_revenue ?? 0), 0),
      }
      return acc
    },
    {} as Record<LeadStage, { count: number; revenue: number }>
  )

  const fetchData = useCallback(async () => {
    setLoading(true)

    try {
      const [statsRes, leadsRes] = await Promise.all([
        fetch('/api/dashboard/stats'),
        fetch('/api/leads/hot'),
      ])

      // ── Stats ─────────────────────────────────────────────
      if (statsRes.ok) {
        const stats = await statsRes.json() as DashboardSummary
        setSummary(stats)
      } else {
        console.error('[Dashboard] stats API failed:', statsRes.status)
      }

      // ── Leads ─────────────────────────────────────────────
      if (leadsRes.ok) {
        const data = await leadsRes.json()

        console.log('[Dashboard] leads API response:', data)

        const parsedLeads =
          Array.isArray(data)
            ? data
            : Array.isArray(data?.leads)
              ? data.leads
              : []

        console.log('[Dashboard] parsed leads:', parsedLeads.length)

        setLeads(parsedLeads)
      } else {
        console.error('[Dashboard] leads API failed:', leadsRes.status)
      }

      setLastRefresh(new Date())

    } catch (err) {
      console.error('[Dashboard] fetchData failed:', err)
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

  function handleSort(field: SortField) {
    if (sortBy === field) setSortDir((d) => d === 'desc' ? 'asc' : 'desc')
    else { setSortBy(field); setSortDir('desc') }
  }

  // Derived KPI values computed from live leads array
  const hotCount       = leads.filter((l) => l.lead_temperature === 'HOT').length
  const qualifiedCount = leads.filter((l) => l.lead_stage === 'QUALIFIED' || l.lead_stage === 'NEGOTIATING').length
  const escCount       = leads.filter((l) => l.escalation_required).length
  const totalRevenue   = leads.reduce((s, l) => s + (l.estimated_revenue ?? 0), 0)
  const confirmedCount = leads.filter((l) => l.lead_stage === 'CONFIRMED').length
  const convRate       = leads.length > 0 ? Math.round((confirmedCount / leads.length) * 100) : 0

  // Filter + sort
  const displayed = leads
    .filter((l) => {
      const matchesFilter: boolean =
        filter === 'all'          ? true :
        filter === 'hot'          ? l.lead_temperature === 'HOT' :
        filter === 'escalations'  ? l.escalation_required :
        filter === 'qualified'    ? l.lead_stage === 'QUALIFIED' :
        filter === 'stale'        ? (
          l.lead_temperature === 'HOT' &&
          !!l.last_contacted_at &&
          (Date.now() - new Date(l.last_contacted_at).getTime()) > 4 * 3_600_000
        ) :
        filter === 'follow_up_due'? (!!l.next_follow_up_at && new Date(l.next_follow_up_at) <= new Date()) :
        filter === 'confirmed'    ? l.lead_stage === 'CONFIRMED' :
        filter === 'lost'         ? l.lead_stage === 'LOST' :
        true

      const matchesStage   = stageFilter === 'ALL' || l.lead_stage === stageFilter
      const matchesSearch  = !search || [l.name, l.phone, l.event_type, l.email]
        .some((f) => f?.toLowerCase().includes(search.toLowerCase()))

      return matchesFilter && matchesStage && matchesSearch
    })
    .sort((a, b) => {
      let diff = 0
      if (sortBy === 'priority') diff = priorityValue(b) - priorityValue(a)
      else if (sortBy === 'score')   diff = (b.ai_score ?? 0) - (a.ai_score ?? 0)
      else if (sortBy === 'revenue') diff = (b.estimated_revenue ?? 0) - (a.estimated_revenue ?? 0)
      else diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      return sortDir === 'desc' ? diff : -diff
    })

  const QUICK_FILTERS: { id: FilterType; label: string; count?: number; accent?: string }[] = [
    { id: 'hot',          label: '🔥 HOT',           count: hotCount,                  accent: 'text-red-600' },
    { id: 'escalations',  label: '🚨 Priority',      count: escCount,                  accent: 'text-red-700' },
    { id: 'qualified',    label: '✅ Qualified',      count: qualifiedCount                                    },
    { id: 'stale',        label: '⏰ Stale',          count: summary?.stale_hot_leads                         },
    { id: 'follow_up_due',label: '📤 Follow-up Due',  count: summary?.follow_ups_due                          },
    { id: 'confirmed',    label: '🏆 Confirmed',      count: confirmedCount                                    },
    { id: 'lost',         label: '❌ Lost'                                                                     },
    { id: 'all',          label: 'All Leads',         count: leads.length                                     },
  ]

  return (
    <div className="min-h-screen bg-gray-50/60 flex flex-col">

      {/* ── Sticky header ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-200 px-6 py-3">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-black text-gray-900 tracking-tight flex items-center gap-2">
              <Zap className="w-4 h-4 text-blue-600" />
              Sales Operations
            </h1>
            <p className="text-xs text-gray-400">
              {leads.length} leads · refreshed {lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {escCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold animate-pulse">
                <AlertTriangle className="w-3.5 h-3.5" />
                {escCount} escalated
              </div>
            )}
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 font-medium"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-screen-2xl mx-auto w-full px-6 py-5 space-y-5">

        {/* ── KPI cards ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard
            label="Total Leads"
            value={leads.length}
            sub={`${leads.filter((l) => {
              const now = new Date(); const created = new Date(l.created_at)
              return now.toDateString() === created.toDateString()
            }).length} today`}
            icon={Users}
            accent="bg-gray-100 text-gray-600"
          />
          <StatCard
            label="HOT Leads"
            value={hotCount}
            sub={`${summary?.stale_hot_leads ?? 0} stale`}
            icon={Flame}
            accent="bg-red-100 text-red-600"
            highlight={hotCount > 0}
          />
          <StatCard
            label="Qualified"
            value={qualifiedCount}
            sub="ready to close"
            icon={Target}
            accent="bg-indigo-100 text-indigo-600"
          />
          <StatCard
            label="Escalated"
            value={escCount}
            sub="needs attention"
            icon={AlertTriangle}
            accent="bg-amber-100 text-amber-600"
            highlight={escCount > 0}
          />
          <StatCard
            label="Pipeline Value"
            value={formatINR(totalRevenue)}
            sub="estimated"
            icon={TrendingUp}
            accent="bg-blue-100 text-blue-600"
          />
          <StatCard
            label="Conversion"
            value={`${convRate}%`}
            sub={`${confirmedCount} confirmed`}
            icon={CheckCircle2}
            accent="bg-emerald-100 text-emerald-600"
          />
        </div>

        {/* ── Pipeline stage bar ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">
              Pipeline Distribution
            </h2>
            {stageFilter !== 'ALL' && (
              <button
                onClick={() => setStageFilter('ALL')}
                className="text-xs text-blue-600 hover:underline"
              >
                Clear filter
              </button>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {LEAD_STAGES.map((s) => (
              <PipelineCard
                key={s}
                stage={s}
                count={stageCounts[s].count}
                revenue={stageCounts[s].revenue}
                onClick={() => setStageFilter((prev) => prev === s ? 'ALL' : s)}
                active={stageFilter === s}
              />
            ))}
          </div>
        </div>

        {/* ── Filter + search bar ────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 px-4 py-3">
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            {QUICK_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  filter === f.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f.label}
                {f.count !== undefined && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                    filter === f.id ? 'bg-white/25 text-white' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {f.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, phone, event..."
                className="pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-xs w-48 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Stage filter select */}
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-gray-400" />
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value as LeadStage | 'ALL')}
                className="border border-gray-200 rounded-lg text-xs px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
              >
                <option value="ALL">All stages</option>
                {LEAD_STAGES.map((s) => (
                  <option key={s} value={s}>{STAGE_CONFIG[s].label}</option>
                ))}
              </select>
            </div>

            {/* Sort select */}
            <div className="flex items-center gap-1.5 ml-auto">
              <ArrowUpRight className="w-3.5 h-3.5 text-gray-400" />
              <select
                value={`${sortBy}-${sortDir}`}
                onChange={(e) => {
                  const [f, d] = e.target.value.split('-') as [SortField, SortDir]
                  setSortBy(f); setSortDir(d)
                }}
                className="border border-gray-200 rounded-lg text-xs px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
              >
                <option value="priority-desc">Sort: Priority (default)</option>
                <option value="score-desc">Sort: AI Score ↓</option>
                <option value="score-asc">Sort: AI Score ↑</option>
                <option value="revenue-desc">Sort: Revenue ↓</option>
                <option value="created-desc">Sort: Newest</option>
                <option value="created-asc">Sort: Oldest</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── Leads table ───────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {/* Table header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/60">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-bold text-gray-900">
                {displayed.length}
              </span>
              <span className="text-xs text-gray-400">
                {displayed.length !== leads.length ? `of ${leads.length} leads` : 'leads'}
              </span>
            </div>
            {loading && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin" /> Updating...
              </span>
            )}
          </div>

          {displayed.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-6">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-sm font-semibold text-gray-600">No leads match the current filters</p>
              <p className="text-xs text-gray-400 mt-1">Try changing the filter or search term</p>
              <button
                onClick={() => { setFilter('all'); setSearch(''); setStageFilter('ALL') }}
                className="mt-4 text-xs text-blue-600 hover:underline font-medium"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80">
                    <th className="pl-4 pr-2 py-3 w-6" /> {/* escalation bar */}
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">Temp</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Contact</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Event</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">Guests</th>
                    <SortTh label="Score"   field="score"   current={sortBy} dir={sortDir} onSort={handleSort} align="center" />
                    <SortTh label="Revenue" field="revenue" current={sortBy} dir={sortDir} onSort={handleSort} align="right"  />
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Stage</th>
                    <SortTh label="Contact" field="created" current={sortBy} dir={sortDir} onSort={handleSort} />
                    <th className="px-3 py-3 pr-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((lead) => (
                    <LeadRow key={lead.id} lead={lead} onStageChange={handleStageChange} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer summary */}
          {displayed.length > 0 && (
            <div className="px-5 py-2.5 border-t border-gray-100 bg-gray-50/60 flex items-center justify-between">
              <span className="text-xs text-gray-400">
                {displayed.filter((l) => l.escalation_required).length} escalated ·{' '}
                {displayed.filter((l) => l.lead_temperature === 'HOT').length} hot ·{' '}
                {displayed.filter((l) => l.lead_stage === 'QUALIFIED').length} qualified
              </span>
              <span className="text-xs font-semibold text-gray-600">
                {formatINR(displayed.reduce((s, l) => s + (l.estimated_revenue ?? 0), 0))} pipeline
              </span>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
