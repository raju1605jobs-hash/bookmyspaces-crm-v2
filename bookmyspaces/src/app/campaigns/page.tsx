'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Megaphone, Sparkles, Calendar, Users, Send, RefreshCw,
  CheckCircle, AlertCircle, Eye, Plus, Star, Zap, PartyPopper
} from 'lucide-react'

interface Campaign {
  id: string
  name: string
  type: string
  status: string
  recipient_count: number
  sent_count: number
  failed_count: number
  message_template: string
  created_at: string
  sent_at: string | null
}

interface Festival {
  id: string
  name: string
  date: string
  type: string
  days_before_alert: number
}

const CAMPAIGN_TYPES = [
  { value: 'festival', label: '🎉 Festival Greeting', desc: 'Diwali, Holi, Christmas etc.' },
  { value: 'followup', label: '📲 Follow-up', desc: 'Re-engage stale leads' },
  { value: 'reengagement', label: '🔄 Re-engagement', desc: 'Cold leads from 30+ days ago' },
  { value: 'offer', label: '🏷️ Special Offer', desc: 'Promotions and discounts' },
  { value: 'custom', label: '✍️ Custom', desc: 'Write your own message' },
]

const SEGMENT_OPTIONS = [
  { value: 'all_active', label: 'All Active Leads', filter: { status: ['new_inquiry', 'followup_pending', 'proposal_sent'] } },
  { value: 'new', label: 'New Inquiries Only', filter: { status: ['new_inquiry'] } },
  { value: 'vip', label: 'VIP Leads (Score 7+)', filter: { is_vip: true } },
  { value: 'cold', label: 'Cold / Future Prospects', filter: { status: ['future_prospect', 'rejected'] } },
  { value: 'all', label: 'All Leads with Phone', filter: {} },
]

const TONE_OPTIONS = [
  { value: 'warm', label: '❤️ Warm & Friendly' },
  { value: 'urgent', label: '⚡ Urgency / FOMO' },
  { value: 'exclusive', label: '💎 VIP / Exclusive' },
]

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [festivals, setFestivals] = useState<Festival[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'campaigns' | 'create' | 'festivals' | 'summary'>('campaigns')

  // Create form state
  const [campaignType, setCampaignType] = useState('followup')
  const [campaignName, setCampaignName] = useState('')
  const [selectedSegment, setSelectedSegment] = useState('all_active')
  const [message, setMessage] = useState('')
  const [tone, setTone] = useState('warm')
  const [context, setContext] = useState('')
  const [selectedFestival, setSelectedFestival] = useState('')
  const [isGeneratingMsg, setIsGeneratingMsg] = useState(false)
  const [isPreviewingSegment, setIsPreviewingSegment] = useState(false)
  const [segmentPreview, setSegmentPreview] = useState<any>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [result, setResult] = useState<any>(null)

  // Summary state
  const [summaries, setSummaries] = useState<any[]>([])
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)
  const [latestSummary, setLatestSummary] = useState<any>(null)
  const [sendSummaryWhatsApp, setSendSummaryWhatsApp] = useState(false)
  const [isDetectingVIPs, setIsDetectingVIPs] = useState(false)
  const [vipResult, setVipResult] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [campRes, festRes, sumRes] = await Promise.all([
        fetch('/api/campaigns'),
        fetch('/api/campaigns?view=festivals'),
        fetch('/api/ai-summary'),
      ])
      const campData = await campRes.json()
      const festData = await festRes.json()
      const sumData = await sumRes.json()

      setCampaigns(campData.campaigns || [])
      setFestivals(festData.festivals || [])
      setSummaries(sumData.summaries || [])
      if (sumData.summaries?.[0]) setLatestSummary(sumData.summaries[0])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const generateMessage = async () => {
    setIsGeneratingMsg(true)
    try {
      let endpoint = '/api/campaigns'
      let body: any

      if (campaignType === 'festival' && selectedFestival) {
        body = { action: 'generate_festival', festival: selectedFestival }
      } else {
        body = { action: 'generate_message', type: campaignType, context, tone }
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.message?.full_message) setMessage(data.message.full_message)
      else if (data.message) setMessage(typeof data.message === 'string' ? data.message : data.message.full_message || '')
    } finally {
      setIsGeneratingMsg(false)
    }
  }

  const previewSegment = async () => {
    setIsPreviewingSegment(true)
    const seg = SEGMENT_OPTIONS.find(s => s.value === selectedSegment)
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview', segment: seg?.filter || {} }),
      })
      const data = await res.json()
      setSegmentPreview(data)
    } finally {
      setIsPreviewingSegment(false)
    }
  }

  const createAndSend = async (dryRun: boolean) => {
    if (!message.trim()) { setResult({ error: 'Please write or generate a message first' }); return }
    const seg = SEGMENT_OPTIONS.find(s => s.value === selectedSegment)

    if (dryRun) {
      setIsPreviewingSegment(true)
      await previewSegment()
      setIsPreviewingSegment(false)
      return
    }

    setIsCreating(true)
    setResult(null)
    try {
      // Create campaign
      const createRes = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          name: campaignName || `${campaignType} — ${new Date().toLocaleDateString('en-IN')}`,
          type: campaignType,
          segment: seg?.filter || {},
          message_template: message,
        }),
      })
      const createData = await createRes.json()
      if (!createData.campaign) throw new Error(createData.error || 'Create failed')

      // Send it
      setIsSending(true)
      const sendRes = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', campaign_id: createData.campaign.id, dry_run: false }),
      })
      const sendData = await sendRes.json()
      setResult({ ...sendData, campaign_number: createData.campaign.id.slice(0, 8) })
      fetchData()
    } catch (err: any) {
      setResult({ error: err.message })
    } finally {
      setIsCreating(false)
      setIsSending(false)
    }
  }

  const generateSummary = async () => {
    setIsGeneratingSummary(true)
    try {
      const res = await fetch('/api/ai-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', send_whatsapp: sendSummaryWhatsApp }),
      })
      const data = await res.json()
      if (data.summary) {
        setLatestSummary(data.summary)
        setSummaries(prev => [data.summary, ...prev.slice(0, 6)])
      }
    } finally {
      setIsGeneratingSummary(false)
    }
  }

  const detectVIPs = async () => {
    setIsDetectingVIPs(true)
    setVipResult(null)
    try {
      const res = await fetch('/api/ai-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'detect_vips' }),
      })
      const data = await res.json()
      setVipResult(`✅ Flagged ${data.flagged} new VIP leads`)
    } finally {
      setIsDetectingVIPs(false)
    }
  }

  const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
    draft:     { color: '#6b7280', bg: '#f3f4f6' },
    running:   { color: '#d97706', bg: '#fffbeb' },
    completed: { color: '#16a34a', bg: '#f0fdf4' },
    failed:    { color: '#dc2626', bg: '#fef2f2' },
    scheduled: { color: '#2563eb', bg: '#eff6ff' },
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--cream)', fontFamily: 'var(--font-body)' }}>
      {/* Nav */}
      <nav className="sticky top-0 z-40 px-6 py-4 flex items-center justify-between"
        style={{ background: 'rgba(248,245,240,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)' }}>
        <div className="text-xl font-light" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          BookMySpaces <span className="text-sm" style={{ color: 'var(--gold)' }}>Campaigns</span>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchData} className="p-2 rounded-lg hover:bg-white">
            <RefreshCw size={15} style={{ color: 'var(--slate)' }} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <a href="/analytics" className="text-sm px-4 py-2 rounded-lg"
            style={{ border: '1px solid var(--border)', background: 'white', color: 'var(--slate)' }}>
            ← Analytics
          </a>
          <a href="/dashboard" className="text-sm px-4 py-2 rounded-lg"
            style={{ border: '1px solid var(--border)', background: 'white', color: 'var(--slate)' }}>
            ← CRM
          </a>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="flex gap-1 mb-8 p-1 rounded-xl w-fit" style={{ background: 'white', border: '1px solid var(--border)' }}>
          {[
            { id: 'campaigns', label: '📊 History' },
            { id: 'create', label: '✨ Create Campaign' },
            { id: 'festivals', label: '🎉 Festivals' },
            { id: 'summary', label: '🤖 AI Summary' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: activeTab === tab.id ? '#0f1923' : 'transparent',
                color: activeTab === tab.id ? 'white' : 'var(--slate)',
              }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── CAMPAIGNS HISTORY ── */}
        {activeTab === 'campaigns' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-light" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                Campaign History
              </h2>
              <button onClick={() => setActiveTab('create')}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm"
                style={{ background: 'linear-gradient(135deg, #c9a84c, #a07a28)' }}>
                <Plus size={14} /> New Campaign
              </button>
            </div>

            {campaigns.length === 0 ? (
              <div className="text-center py-16 rounded-2xl"
                style={{ background: 'white', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                <Megaphone size={40} className="mx-auto mb-3 opacity-30" />
                <p className="font-medium">No campaigns yet</p>
                <p className="text-sm mt-1">Create your first campaign to start reaching leads</p>
              </div>
            ) : (
              <div className="space-y-3">
                {campaigns.map(c => {
                  const st = STATUS_STYLE[c.status] || STATUS_STYLE.draft
                  return (
                    <div key={c.id} className="rounded-2xl p-5"
                      style={{ background: 'white', border: '1px solid var(--border)' }}>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-3 mb-1">
                            <span className="font-medium" style={{ color: 'var(--charcoal)' }}>{c.name}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full"
                              style={{ background: st.bg, color: st.color }}>{c.status}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full"
                              style={{ background: '#f3f4f6', color: '#6b7280' }}>{c.type}</span>
                          </div>
                          <p className="text-sm line-clamp-1 max-w-lg" style={{ color: 'var(--muted)' }}>
                            {c.message_template}
                          </p>
                        </div>
                        <div className="text-right text-sm flex-shrink-0 ml-4">
                          <div className="font-medium" style={{ color: 'var(--charcoal)' }}>{c.recipient_count} recipients</div>
                          {c.sent_count > 0 && (
                            <div className="text-xs mt-0.5" style={{ color: '#16a34a' }}>
                              ✓ {c.sent_count} sent · ✗ {c.failed_count} failed
                            </div>
                          )}
                          <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                            {new Date(c.created_at).toLocaleDateString('en-IN')}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── CREATE CAMPAIGN ── */}
        {activeTab === 'create' && (
          <div className="max-w-3xl">
            <h2 className="text-2xl font-light mb-6" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              Create Campaign
            </h2>

            <div className="space-y-6">
              {/* Campaign Type */}
              <div className="rounded-2xl p-6" style={{ background: 'white', border: '1px solid var(--border)' }}>
                <label className="text-xs uppercase tracking-wider mb-3 block" style={{ color: 'var(--muted)' }}>
                  Campaign Type
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {CAMPAIGN_TYPES.map(ct => (
                    <button key={ct.value} onClick={() => setCampaignType(ct.value)}
                      className="p-4 rounded-xl text-left transition-all"
                      style={{
                        border: campaignType === ct.value ? '2px solid var(--gold)' : '1px solid var(--border)',
                        background: campaignType === ct.value ? 'rgba(201,168,76,0.06)' : 'var(--cream)',
                      }}>
                      <div className="font-medium text-sm" style={{ color: campaignType === ct.value ? 'var(--gold-dark)' : 'var(--charcoal)' }}>
                        {ct.label}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{ct.desc}</div>
                    </button>
                  ))}
                </div>

                {campaignType === 'festival' && (
                  <div className="mt-4">
                    <label className="text-xs mb-1.5 block" style={{ color: 'var(--muted)' }}>Select Festival</label>
                    <select value={selectedFestival} onChange={e => setSelectedFestival(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                      style={{ border: '1px solid var(--border)', background: 'white' }}>
                      <option value="">Choose festival...</option>
                      {festivals.map(f => (
                        <option key={f.id} value={f.name}>
                          {f.name} — {new Date(f.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </option>
                      ))}
                      <option value="custom">Custom Festival...</option>
                    </select>
                  </div>
                )}

                <div className="mt-4">
                  <label className="text-xs mb-1.5 block" style={{ color: 'var(--muted)' }}>Campaign Name</label>
                  <input value={campaignName} onChange={e => setCampaignName(e.target.value)}
                    placeholder={`${campaignType} — ${new Date().toLocaleDateString('en-IN')}`}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ border: '1px solid var(--border)', fontFamily: 'var(--font-body)' }} />
                </div>
              </div>

              {/* Audience */}
              <div className="rounded-2xl p-6" style={{ background: 'white', border: '1px solid var(--border)' }}>
                <label className="text-xs uppercase tracking-wider mb-3 block" style={{ color: 'var(--muted)' }}>
                  Target Audience
                </label>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {SEGMENT_OPTIONS.map(s => (
                    <button key={s.value} onClick={() => setSelectedSegment(s.value)}
                      className="px-3 py-2 rounded-lg text-sm text-left transition-all"
                      style={{
                        border: selectedSegment === s.value ? '1.5px solid var(--gold)' : '1px solid var(--border)',
                        background: selectedSegment === s.value ? 'rgba(201,168,76,0.08)' : 'var(--cream)',
                        color: selectedSegment === s.value ? 'var(--gold-dark)' : 'var(--slate)',
                      }}>
                      {s.label}
                    </button>
                  ))}
                </div>
                <button onClick={previewSegment} disabled={isPreviewingSegment}
                  className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg disabled:opacity-50"
                  style={{ border: '1px solid var(--border)', color: 'var(--slate)', background: 'var(--cream)' }}>
                  {isPreviewingSegment ? <RefreshCw size={13} className="animate-spin" /> : <Eye size={13} />}
                  Preview Audience
                </button>
                {segmentPreview && (
                  <div className="mt-3 p-3 rounded-lg text-sm" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                    <p className="font-medium">{segmentPreview.count} recipients in this segment</p>
                    {segmentPreview.sample?.map((r: any, i: number) => (
                      <p key={i} className="text-xs mt-1 opacity-80">• {r.name || 'Unknown'} ({r.phone}) — {r.status}</p>
                    ))}
                  </div>
                )}
              </div>

              {/* Message */}
              <div className="rounded-2xl p-6" style={{ background: 'white', border: '1px solid var(--border)' }}>
                <label className="text-xs uppercase tracking-wider mb-3 block" style={{ color: 'var(--muted)' }}>
                  Message
                </label>

                {/* AI generation controls */}
                <div className="flex flex-wrap gap-2 mb-3">
                  <div className="flex gap-1">
                    {TONE_OPTIONS.map(t => (
                      <button key={t.value} onClick={() => setTone(t.value)}
                        className="text-xs px-3 py-1.5 rounded-lg transition-all"
                        style={{
                          border: tone === t.value ? '1.5px solid var(--gold)' : '1px solid var(--border)',
                          background: tone === t.value ? 'rgba(201,168,76,0.08)' : 'white',
                          color: tone === t.value ? 'var(--gold-dark)' : 'var(--slate)',
                        }}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {campaignType !== 'festival' && (
                  <div className="mb-3">
                    <input value={context} onChange={e => setContext(e.target.value)}
                      placeholder="Optional: any specific context for the message (e.g. 'weekend offer', 'monsoon special')"
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                      style={{ border: '1px solid var(--border)', fontFamily: 'var(--font-body)' }} />
                  </div>
                )}

                <button onClick={generateMessage} disabled={isGeneratingMsg}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-medium mb-3 disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #0f1923, #1a2840)' }}>
                  {isGeneratingMsg ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  Generate with AI
                </button>

                <textarea value={message} onChange={e => setMessage(e.target.value)}
                  placeholder="Your WhatsApp message will appear here (or write your own)..."
                  rows={6} className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                  style={{ border: '1px solid var(--border)', fontFamily: 'var(--font-body)', color: 'var(--charcoal)' }} />
                <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{message.length} characters</p>
              </div>

              {result && (
                <div className="px-4 py-3 rounded-xl text-sm"
                  style={{
                    background: result.error ? '#fef2f2' : '#f0fdf4',
                    color: result.error ? '#dc2626' : '#16a34a',
                    border: `1px solid ${result.error ? '#fca5a5' : '#86efac'}`,
                  }}>
                  {result.error ? `❌ ${result.error}` : `✅ Campaign sent! ${result.sent} messages delivered, ${result.failed} failed.`}
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => createAndSend(false)} disabled={isCreating || isSending}
                  className="flex-1 py-3.5 rounded-xl text-white font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #c9a84c, #a07a28)' }}>
                  {isCreating || isSending ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
                  {isSending ? 'Sending...' : isCreating ? 'Creating...' : '🚀 Send Campaign Now'}
                </button>
              </div>

              <p className="text-xs text-center" style={{ color: 'var(--muted)' }}>
                ⚠️ Campaign messages are sent as WhatsApp session messages. Ensure leads have messaged you within 24h, or use approved templates.
              </p>
            </div>
          </div>
        )}

        {/* ── FESTIVALS ── */}
        {activeTab === 'festivals' && (
          <div>
            <h2 className="text-2xl font-light mb-6" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              Upcoming Festivals
            </h2>
            <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
              Plan your festival campaigns in advance. Click any festival to generate a message.
            </p>

            <div className="grid md:grid-cols-2 gap-4">
              {festivals.map(f => {
                const daysUntil = Math.ceil((new Date(f.date).getTime() - Date.now()) / 86400000)
                const isNear = daysUntil <= 10
                return (
                  <div key={f.id} className="rounded-2xl p-5 card-hover"
                    style={{
                      background: 'white',
                      border: `1px solid ${isNear ? 'rgba(201,168,76,0.4)' : 'var(--border)'}`,
                    }}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-medium" style={{ color: 'var(--charcoal)' }}>{f.name}</h3>
                        <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
                          {new Date(f.date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${isNear ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-500'}`}>
                          {daysUntil === 0 ? 'Today!' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil} days`}
                        </span>
                        <div className="mt-1">
                          <span className="text-xs px-2 py-0.5 rounded-full"
                            style={{ background: '#f3f4f6', color: '#6b7280' }}>{f.type}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => { setActiveTab('create'); setCampaignType('festival'); setSelectedFestival(f.name) }}
                      className="w-full text-sm py-2 rounded-lg flex items-center justify-center gap-2"
                      style={{ border: '1px solid var(--border)', color: 'var(--slate)', background: 'var(--cream)' }}>
                      <Megaphone size={13} /> Create Campaign
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── AI SUMMARY ── */}
        {activeTab === 'summary' && (
          <div className="max-w-3xl">
            <h2 className="text-2xl font-light mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
              AI Daily Summary
            </h2>
            <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
              Generate an intelligent business summary with action items, VIP lead alerts, and follow-up priorities.
            </p>

            <div className="rounded-2xl p-6 mb-6"
              style={{ background: 'white', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-4 mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={sendSummaryWhatsApp} onChange={e => setSendSummaryWhatsApp(e.target.checked)}
                    className="w-4 h-4 rounded" />
                  <span className="text-sm" style={{ color: 'var(--slate)' }}>
                    Also send to WhatsApp (9051459463)
                  </span>
                </label>
              </div>

              <div className="flex gap-3">
                <button onClick={generateSummary} disabled={isGeneratingSummary}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #c9a84c, #a07a28)' }}>
                  {isGeneratingSummary ? <RefreshCw size={15} className="animate-spin" /> : <Sparkles size={15} />}
                  Generate Today's Summary
                </button>

                <button onClick={detectVIPs} disabled={isDetectingVIPs}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm disabled:opacity-50"
                  style={{ border: '1px solid var(--border)', color: 'var(--slate)', background: 'var(--cream)' }}>
                  {isDetectingVIPs ? <RefreshCw size={15} className="animate-spin" /> : <Star size={15} />}
                  Detect VIP Leads
                </button>
              </div>

              {vipResult && (
                <p className="mt-3 text-sm" style={{ color: '#16a34a' }}>{vipResult}</p>
              )}
            </div>

            {/* Latest Summary */}
            {latestSummary && (
              <div className="rounded-2xl p-6 mb-6"
                style={{ background: '#0f1923', border: '1px solid rgba(201,168,76,0.2)' }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-xs tracking-widest uppercase" style={{ color: 'var(--gold)' }}>
                    Summary for {new Date(latestSummary.date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </div>
                  {latestSummary.sent_via_whatsapp && (
                    <span className="text-xs px-2 py-1 rounded-full" style={{ background: '#25D36620', color: '#25D366' }}>
                      ✓ Sent via WhatsApp
                    </span>
                  )}
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: '#d1d5db' }}>
                  {latestSummary.summary_text}
                </p>

                {latestSummary.action_items?.length > 0 && (
                  <div className="mt-5 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <p className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--gold)' }}>Action Items</p>
                    <ul className="space-y-1.5">
                      {latestSummary.action_items.map((item: string, i: number) => (
                        <li key={i} className="text-sm flex items-start gap-2" style={{ color: '#9ca3af' }}>
                          <span style={{ color: 'var(--gold)', marginTop: '2px' }}>→</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {latestSummary.key_metrics && (
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    {Object.entries(latestSummary.key_metrics).slice(0, 6).map(([k, v]) => (
                      <div key={k} className="text-center">
                        <div className="text-xl font-light" style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)' }}>
                          {String(v)}
                        </div>
                        <div className="text-xs capitalize" style={{ color: 'rgba(255,255,255,0.4)' }}>
                          {k.replace(/_/g, ' ')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* History */}
            {summaries.length > 1 && (
              <div>
                <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--muted)' }}>Previous Summaries</h3>
                <div className="space-y-2">
                  {summaries.slice(1).map(s => (
                    <div key={s.id} className="flex items-center justify-between px-4 py-3 rounded-xl"
                      style={{ background: 'white', border: '1px solid var(--border)' }}>
                      <span className="text-sm" style={{ color: 'var(--charcoal)' }}>
                        {new Date(s.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </span>
                      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
                        {s.key_metrics?.new_leads} leads · {s.key_metrics?.confirmed} confirmed
                        {s.sent_via_whatsapp && <span style={{ color: '#25D366' }}>· WhatsApp ✓</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
