'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  TrendingUp, Users, CheckCircle, IndianRupee, BarChart3,
  RefreshCw, Brain, Phone, Calendar, Star, ArrowUpRight,
  MessageSquare, Zap
} from 'lucide-react'

interface AnalyticsData {
  period: number
  summary: {
    total_leads: number
    new_leads: number
    confirmed: number
    conversion_rate: number
    confirmed_revenue: number
    pipeline_revenue: number
    proposals_sent: number
    avg_lead_score: number
  }
  status_breakdown: Record<string, number>
  source_breakdown: Record<string, number>
  channel_breakdown: Record<string, number>
  daily_chart: Array<{ date: string; label: string; count: number }>
  recent_leads: any[]
}

const STATUS_LABELS: Record<string, string> = {
  new_inquiry: 'New Inquiry',
  followup_pending: 'Follow-up',
  proposal_sent: 'Proposal Sent',
  negotiation: 'Negotiation',
  confirmed: 'Confirmed',
  rejected: 'Rejected',
  future_prospect: 'Future Prospect',
}

const STATUS_COLORS: Record<string, string> = {
  new_inquiry: '#2563eb',
  followup_pending: '#d97706',
  proposal_sent: '#7c3aed',
  negotiation: '#ea580c',
  confirmed: '#16a34a',
  rejected: '#dc2626',
  future_prospect: '#4b5563',
}

const SOURCE_EMOJIS: Record<string, string> = {
  website: '🌐',
  whatsapp: '📱',
  instagram: '📸',
  justdial: '📞',
  referral: '🤝',
  other: '📌',
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [period, setPeriod] = useState(30)
  const [isLoading, setIsLoading] = useState(true)
  const [isScoringLeads, setIsScoringLeads] = useState(false)
  const [scoreMsg, setScoreMsg] = useState<string | null>(null)
  const [followupLeads, setFollowupLeads] = useState<any[]>([])
  const [isFollowingUp, setIsFollowingUp] = useState(false)
  const [followupMsg, setFollowupMsg] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [analyticsRes, followupRes] = await Promise.all([
        fetch(`/api/analytics?period=${period}`),
        fetch('/api/followups'),
      ])
      const analyticsData = await analyticsRes.json()
      const followupData = await followupRes.json()
      setData(analyticsData)
      setFollowupLeads(followupData.leads || [])
    } catch (err) {
      // Silent failure — UI shows empty state
    } finally {
      setIsLoading(false)
    }
  }, [period])

  useEffect(() => { fetchData() }, [fetchData])

  const scoreAllLeads = async () => {
    setIsScoringLeads(true)
    setScoreMsg(null)
    try {
      const res = await fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'score_leads' }),
      })
      const result = await res.json()
      setScoreMsg(`✅ AI scored ${result.scored} leads`)
      fetchData()
    } catch {
      setScoreMsg('❌ Scoring failed')
    } finally {
      setIsScoringLeads(false)
    }
  }

  const bulkFollowup = async () => {
    setIsFollowingUp(true)
    setFollowupMsg(null)
    try {
      const res = await fetch('/api/followups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk' }),
      })
      const result = await res.json()
      setFollowupMsg(`✅ Sent ${result.sent} follow-up messages`)
      fetchData()
    } catch {
      setFollowupMsg('❌ Follow-up failed')
    } finally {
      setIsFollowingUp(false)
    }
  }

  const singleFollowup = async (leadId: string) => {
    await fetch('/api/followups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'single', lead_id: leadId }),
    })
    fetchData()
  }

  // Chart max
  const chartMax = data ? Math.max(...data.daily_chart.map(d => d.count), 1) : 1

  return (
    <div className="min-h-screen" style={{ background: 'var(--cream)', fontFamily: 'var(--font-body)' }}>
      {/* Nav */}
      <nav className="sticky top-0 z-40 px-6 py-4 flex items-center justify-between"
        style={{ background: 'rgba(248,245,240,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)' }}>
        <div className="text-xl font-light" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          BookMySpaces <span className="text-sm" style={{ color: 'var(--gold)' }}>Analytics</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Period selector */}
          <div className="flex gap-1 rounded-lg p-1" style={{ background: 'white', border: '1px solid var(--border)' }}>
            {[7, 30, 90].map(d => (
              <button key={d} onClick={() => setPeriod(d)}
                className="px-3 py-1 rounded-md text-sm transition-all"
                style={{
                  background: period === d ? '#0f1923' : 'transparent',
                  color: period === d ? 'white' : 'var(--slate)',
                }}>
                {d}d
              </button>
            ))}
          </div>
          <button onClick={fetchData} className="p-2 rounded-lg hover:bg-white">
            <RefreshCw size={15} style={{ color: 'var(--slate)' }} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <a href="/dashboard" className="text-sm px-4 py-2 rounded-lg"
            style={{ border: '1px solid var(--border)', background: 'white', color: 'var(--slate)' }}>
            ← CRM
          </a>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        {/* ── SUMMARY KPI CARDS ── */}
        {data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Leads', value: data.summary.total_leads, icon: <Users size={18} />, color: '#2563eb', bg: '#eff6ff', suffix: '' },
              { label: 'Confirmed', value: data.summary.confirmed, icon: <CheckCircle size={18} />, color: '#16a34a', bg: '#f0fdf4', suffix: '' },
              { label: 'Conversion Rate', value: data.summary.conversion_rate, icon: <TrendingUp size={18} />, color: '#7c3aed', bg: '#f5f3ff', suffix: '%' },
              { label: 'Avg AI Score', value: data.summary.avg_lead_score, icon: <Star size={18} />, color: '#d97706', bg: '#fffbeb', suffix: '/10' },
            ].map(kpi => (
              <div key={kpi.label} className="rounded-2xl p-5 card-hover"
                style={{ background: 'white', border: '1px solid var(--border)' }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
                  style={{ background: kpi.bg, color: kpi.color }}>
                  {kpi.icon}
                </div>
                <div className="text-3xl font-light" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                  {kpi.value}{kpi.suffix}
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{kpi.label}</div>
                <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Last {period} days</div>
              </div>
            ))}
          </div>
        )}

        {/* Revenue cards */}
        {data && (
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { label: 'Confirmed Revenue', value: data.summary.confirmed_revenue, color: '#16a34a', bg: '#f0fdf4', icon: '✓' },
              { label: 'Pipeline Value', value: data.summary.pipeline_revenue, color: '#7c3aed', bg: '#f5f3ff', icon: '⏳' },
              { label: 'Proposals Sent', value: data.summary.proposals_sent, color: '#2563eb', bg: '#eff6ff', suffix: ' proposals', icon: '📄', isCount: true },
            ].map(card => (
              <div key={card.label} className="rounded-2xl p-5 card-hover"
                style={{ background: 'white', border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <span>{card.icon}</span>
                  <span className="text-sm" style={{ color: 'var(--muted)' }}>{card.label}</span>
                </div>
                <div className="text-2xl font-light" style={{ fontFamily: 'var(--font-display)', color: card.color }}>
                  {(card as any).isCount
                    ? `${card.value}${(card as any).suffix || ''}`
                    : `₹${card.value.toLocaleString('en-IN')}`}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {/* ── DAILY CHART ── */}
          {data && (
            <div className="rounded-2xl p-6" style={{ background: 'white', border: '1px solid var(--border)' }}>
              <h3 className="font-medium mb-5 flex items-center gap-2" style={{ color: 'var(--charcoal)' }}>
                <BarChart3 size={16} style={{ color: 'var(--gold)' }} />
                Daily Leads (last 14 days)
              </h3>
              <div className="flex items-end gap-1.5 h-36">
                {data.daily_chart.map(day => (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full rounded-t-sm transition-all relative group"
                      style={{
                        height: `${Math.max(4, (day.count / chartMax) * 120)}px`,
                        background: day.count > 0 ? 'linear-gradient(180deg, #c9a84c, #a07a28)' : '#e8e4de',
                      }}>
                      {day.count > 0 && (
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"
                          style={{ color: 'var(--charcoal)' }}>
                          {day.count}
                        </div>
                      )}
                    </div>
                    <span className="text-xs" style={{ color: 'var(--muted)', fontSize: '9px' }}>
                      {day.label.split(' ')[0]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── STATUS BREAKDOWN ── */}
          {data && (
            <div className="rounded-2xl p-6" style={{ background: 'white', border: '1px solid var(--border)' }}>
              <h3 className="font-medium mb-5 flex items-center gap-2" style={{ color: 'var(--charcoal)' }}>
                <Users size={16} style={{ color: 'var(--gold)' }} />
                Pipeline Breakdown
              </h3>
              <div className="space-y-3">
                {Object.entries(data.status_breakdown)
                  .sort(([, a], [, b]) => b - a)
                  .map(([status, count]) => {
                    const total = Object.values(data.status_breakdown).reduce((s, c) => s + c, 0)
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0
                    const color = STATUS_COLORS[status] || '#6b7280'
                    return (
                      <div key={status}>
                        <div className="flex justify-between text-sm mb-1">
                          <span style={{ color: 'var(--slate)' }}>{STATUS_LABELS[status] || status}</span>
                          <span className="font-medium" style={{ color: 'var(--charcoal)' }}>{count} ({pct}%)</span>
                        </div>
                        <div className="h-2 rounded-full" style={{ background: '#f0ede8' }}>
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, background: color }} />
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {/* ── SOURCE BREAKDOWN ── */}
          {data && (
            <div className="rounded-2xl p-6" style={{ background: 'white', border: '1px solid var(--border)' }}>
              <h3 className="font-medium mb-5 flex items-center gap-2" style={{ color: 'var(--charcoal)' }}>
                <ArrowUpRight size={16} style={{ color: 'var(--gold)' }} />
                any Sources
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(data.source_breakdown).map(([source, count]) => (
                  <div key={source} className="p-3 rounded-xl"
                    style={{ background: 'var(--cream)', border: '1px solid var(--border)' }}>
                    <div className="text-xl mb-1">{SOURCE_EMOJIS[source] || '📌'}</div>
                    <div className="text-lg font-light" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>{count}</div>
                    <div className="text-xs capitalize" style={{ color: 'var(--muted)' }}>{source}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── AI ACTIONS ── */}
          <div className="rounded-2xl p-6" style={{ background: 'white', border: '1px solid var(--border)' }}>
            <h3 className="font-medium mb-5 flex items-center gap-2" style={{ color: 'var(--charcoal)' }}>
              <Zap size={16} style={{ color: 'var(--gold)' }} />
              AI Automation Actions
            </h3>

            <div className="space-y-4">
              <div>
                <p className="text-sm mb-2" style={{ color: 'var(--slate)' }}>
                  Score all unscored leads using AI (analyzes completeness, urgency, intent)
                </p>
                <button onClick={scoreAllLeads} disabled={isScoringLeads}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #1a2840, #0f1923)' }}>
                  {isScoringLeads ? <RefreshCw size={14} className="animate-spin" /> : <Brain size={14} />}
                  Score Unscored Leads (batch of 20)
                </button>
                {scoreMsg && (
                  <p className="text-xs mt-2" style={{ color: scoreMsg.startsWith('✅') ? '#16a34a' : '#dc2626' }}>
                    {scoreMsg}
                  </p>
                )}
              </div>

              <div className="border-t pt-4" style={{ borderColor: 'var(--border)' }}>
                <p className="text-sm mb-2" style={{ color: 'var(--slate)' }}>
                  Send WhatsApp follow-up to all leads not contacted in 24h ({followupLeads.length} eligible)
                </p>
                <button onClick={bulkFollowup} disabled={isFollowingUp || followupLeads.length === 0}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                  style={{ background: '#25D366' }}>
                  {isFollowingUp ? <RefreshCw size={14} className="animate-spin" /> : <MessageSquare size={14} />}
                  Send Bulk Follow-up ({followupLeads.length})
                </button>
                {followupMsg && (
                  <p className="text-xs mt-2" style={{ color: followupMsg.startsWith('✅') ? '#16a34a' : '#dc2626' }}>
                    {followupMsg}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── FOLLOW-UP LIST ── */}
        {followupLeads.length > 0 && (
          <div className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '1px solid var(--border)' }}>
            <div className="px-6 py-4 border-b flex items-center justify-between"
              style={{ borderColor: 'var(--border)' }}>
              <h3 className="font-medium flex items-center gap-2" style={{ color: 'var(--charcoal)' }}>
                <Phone size={16} style={{ color: '#25D366' }} />
                Needs Follow-up ({followupLeads.length})
              </h3>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>Not contacted in 24h+</span>
            </div>
            <div className="divide-y" style={{ maxHeight: '360px', overflowY: 'auto' }}>
              {followupLeads.map(lead => (
                <div key={lead.id} className="px-6 py-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm" style={{ color: 'var(--charcoal)' }}>
                      {lead.name || 'Unknown'}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
                      {lead.phone && <span>{lead.phone}</span>}
                      {lead.event_type && <span>· {lead.event_type}</span>}
                      {lead.hours_since_contact && (
                        <span style={{ color: lead.hours_since_contact > 48 ? '#dc2626' : '#d97706' }}>
                          · {Math.round(lead.hours_since_contact)}h ago
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {lead.phone && (
                      <a href={`https://wa.me/91${lead.phone}?text=Hi ${lead.name || 'there'}! Following up on your inquiry at BookMySpaces 😊`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-xs px-3 py-1.5 rounded-lg text-white"
                        style={{ background: '#25D366' }}>
                        WhatsApp
                      </a>
                    )}
                    <button onClick={() => singleFollowup(lead.id)}
                      className="text-xs px-3 py-1.5 rounded-lg"
                      style={{ border: '1px solid var(--border)', color: 'var(--slate)' }}>
                      AI Follow-up
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── RECENT LEADS ── */}
        {data?.recent_leads && data.recent_leads.length > 0 && (
          <div className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '1px solid var(--border)' }}>
            <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h3 className="font-medium" style={{ color: 'var(--charcoal)' }}>Recent Activity</h3>
            </div>
            <div className="divide-y">
              {data.recent_leads.map(lead => (
                <div key={lead.id} className="px-6 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>
                      {lead.event_type || 'New Inquiry'}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                      {new Date(lead.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      {lead.venue ? ` · ${lead.venue}` : ''}
                      {' · '}{SOURCE_EMOJIS[lead.source] || ''} {lead.source}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {(lead.ai_score || lead.lead_score) && (
                      <div className="flex items-center gap-1 text-xs px-2 py-1 rounded-full"
                        style={{
                          background: (lead.ai_score || lead.lead_score) >= 7 ? '#f0fdf4' : '#fffbeb',
                          color: (lead.ai_score || lead.lead_score) >= 7 ? '#16a34a' : '#d97706',
                        }}>
                        <Star size={10} />
                        {lead.ai_score || lead.lead_score}/10
                      </div>
                    )}
                    <span className="text-xs px-2 py-1 rounded-full"
                      style={{
                        background: STATUS_COLORS[lead.status] + '15',
                        color: STATUS_COLORS[lead.status] || '#6b7280',
                      }}>
                      {STATUS_LABELS[lead.status] || lead.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
