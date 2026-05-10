'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  MessageSquare,
  Send,
  Users,
  Zap,
  RefreshCw,
  Phone,
  CheckCircle,
  AlertCircle,
  Megaphone,
  Clock,
  ChevronDown,
} from 'lucide-react'

interface Conversation {
  id: string
  session_id: string
  channel: string
  messages: Array<{ role: string; content: string; timestamp: string }>
  is_escalated: boolean
  updated_at: string
  extracted_name: string | null
  extracted_phone: string | null
  leads: { name: string | null; phone: string | null; status: string } | null
}

const QUICK_TEMPLATES = [
  { id: 'greeting', label: '👋 Greeting', desc: 'Welcome message with menu' },
  { id: 'packages', label: '🎉 Packages', desc: 'All rooftop packages with pricing' },
  { id: 'followup', label: '📲 Follow-up', desc: 'Gentle check-in message' },
  { id: 'payment', label: '💳 Payment', desc: 'UPI payment details' },
  { id: 'trust', label: '✅ Trust', desc: 'Genuine business verification' },
  { id: 'urgency', label: '⚠️ Urgency', desc: 'Weekend slots filling fast' },
  { id: 'rooftop', label: '🌆 Rooftop', desc: 'Rooftop venue details' },
  { id: 'dining', label: '🍽️ Dining', desc: 'Private dining info' },
  { id: 'skyline', label: '🏨 Skyline', desc: 'Room stay details' },
  { id: 'cafe', label: '☕ Café', desc: 'Café experience' },
]

export default function WhatsAppPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [sendPhone, setSendPhone] = useState('')
  const [sendMessage, setSendMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [sendResult, setSendResult] = useState<string | null>(null)
  const [activeCampaignType, setActiveCampaignType] = useState('followup')
  const [campaignSegment, setCampaignSegment] = useState('new_inquiry')
  const [isDryRun, setIsDryRun] = useState(true)
  const [campaignResult, setCampaignResult] = useState<any>(null)
  const [isCampaigning, setIsCampaigning] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState('')

  const fetchConversations = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/conversations?channel=whatsapp&limit=50')
      const data = await res.json()
      setConversations(data.conversations || [])
    } catch {
      // Silent failure — UI shows empty state
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  const sendManualMessage = async () => {
    if (!sendPhone.trim() || (!sendMessage.trim() && !selectedTemplate)) return
    setIsSending(true)
    setSendResult(null)

    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: sendPhone,
          message: sendMessage || undefined,
          template: selectedTemplate || undefined,
          type: 'session',
        }),
      })
      const data = await res.json()
      if (data.success) {
        setSendResult('✅ Message sent successfully!')
        setSendMessage('')
        setSelectedTemplate('')
      } else {
        setSendResult(`❌ Failed: ${data.error || 'Unknown error'}`)
      }
    } catch {
      setSendResult('❌ Network error')
    } finally {
      setIsSending(false)
    }
  }

  const runCampaign = async () => {
    setIsCampaigning(true)
    setCampaignResult(null)

    try {
      const res = await fetch('/api/whatsapp/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: activeCampaignType,
          segment: campaignSegment,
          dryRun: isDryRun,
        }),
      })
      const data = await res.json()
      setCampaignResult(data)
    } catch {
      setCampaignResult({ error: 'Network error' })
    } finally {
      setIsCampaigning(false)
    }
  }

  const waConvs = conversations.filter(c => c.channel === 'whatsapp')
  const escalated = waConvs.filter(c => c.is_escalated).length

  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--cream)', fontFamily: 'var(--font-body)' }}
    >
      {/* Nav */}
      <nav
        className="sticky top-0 z-40 px-6 py-4 flex items-center justify-between"
        style={{
          background: 'rgba(248,245,240,0.9)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div
          className="text-xl font-light"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}
        >
          BookMySpaces{' '}
          <span className="text-sm" style={{ color: '#25D366' }}>
            WhatsApp
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchConversations}
            className="p-2 rounded-lg hover:bg-white"
          >
            <RefreshCw
              size={15}
              style={{ color: 'var(--slate)' }}
              className={isLoading ? 'animate-spin' : ''}
            />
          </button>
          <a
            href="/dashboard"
            className="text-sm px-4 py-2 rounded-lg"
            style={{ border: '1px solid var(--border)', background: 'white', color: 'var(--slate)' }}
          >
            ← CRM
          </a>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1
            className="text-3xl font-light mb-1"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}
          >
            WhatsApp Management
          </h1>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {waConvs.length} conversations · {escalated} escalated
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* LEFT — Conversation List */}
          <div className="lg:col-span-1">
            <div
              className="rounded-2xl overflow-hidden"
              style={{ background: 'white', border: '1px solid var(--border)' }}
            >
              <div
                className="px-4 py-3 border-b flex items-center gap-2"
                style={{ borderColor: 'var(--border)' }}
              >
                <MessageSquare size={15} style={{ color: '#25D366' }} />
                <span className="font-medium text-sm" style={{ color: 'var(--charcoal)' }}>
                  WhatsApp Conversations
                </span>
              </div>

              {isLoading ? (
                <div className="flex justify-center py-8">
                  <RefreshCw className="animate-spin" size={20} style={{ color: 'var(--gold)' }} />
                </div>
              ) : waConvs.length === 0 ? (
                <div className="py-10 text-center" style={{ color: 'var(--muted)' }}>
                  <MessageSquare size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No WhatsApp conversations yet</p>
                  <p className="text-xs mt-1">Messages will appear after webhook is configured</p>
                </div>
              ) : (
                <div className="divide-y" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                  {waConvs.map(conv => {
                    const lastMsg = conv.messages?.[conv.messages.length - 1]
                    const name =
                      conv.leads?.name ||
                      conv.extracted_name ||
                      conv.extracted_phone ||
                      'Unknown'

                    return (
                      <div
                        key={conv.id}
                        className="px-4 py-3 cursor-pointer hover:bg-amber-50/30 transition-colors"
                        style={{
                          background:
                            selectedConv?.id === conv.id ? 'rgba(201,168,76,0.06)' : undefined,
                          borderLeft:
                            conv.is_escalated ? '3px solid #ef4444' : '3px solid transparent',
                        }}
                        onClick={() => setSelectedConv(conv)}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm" style={{ color: 'var(--charcoal)' }}>
                            {name}
                          </span>
                          {conv.is_escalated && (
                            <span className="text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                              Escalated
                            </span>
                          )}
                        </div>
                        {lastMsg && (
                          <p
                            className="text-xs truncate"
                            style={{ color: 'var(--muted)', maxWidth: '200px' }}
                          >
                            {lastMsg.role === 'assistant' ? '🤖 ' : '👤 '}
                            {lastMsg.content.substring(0, 60)}...
                          </p>
                        )}
                        <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                          {new Date(conv.updated_at).toLocaleString('en-IN', {
                            timeZone: 'Asia/Kolkata',
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — Detail + Tools */}
          <div className="lg:col-span-2 space-y-6">
            {/* Conversation Detail */}
            {selectedConv ? (
              <div
                className="rounded-2xl overflow-hidden"
                style={{ background: 'white', border: '1px solid var(--border)' }}
              >
                <div
                  className="px-4 py-3 flex items-center justify-between border-b"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div>
                    <span className="font-medium text-sm" style={{ color: 'var(--charcoal)' }}>
                      {selectedConv.leads?.name || selectedConv.extracted_name || 'Unknown'}
                    </span>
                    {selectedConv.extracted_phone && (
                      <span className="text-xs ml-2" style={{ color: 'var(--muted)' }}>
                        {selectedConv.extracted_phone}
                      </span>
                    )}
                  </div>
                  {selectedConv.extracted_phone && (
                    <a
                      href={`https://wa.me/91${selectedConv.extracted_phone}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs px-3 py-1.5 rounded-lg text-white flex items-center gap-1"
                      style={{ background: '#25D366' }}
                    >
                      <Phone size={11} /> Open Chat
                    </a>
                  )}
                </div>

                <div
                  className="p-4 space-y-3 overflow-y-auto"
                  style={{ maxHeight: '350px' }}
                >
                  {selectedConv.messages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className="max-w-[75%] px-3 py-2 rounded-xl text-sm"
                        style={{
                          background:
                            msg.role === 'user' ? '#dcf8c6' : '#f0f0f0',
                          color: 'var(--charcoal)',
                          whiteSpace: 'pre-line',
                        }}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div
                className="rounded-2xl p-8 text-center"
                style={{ background: 'white', border: '1px solid var(--border)', color: 'var(--muted)' }}
              >
                <MessageSquare size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Select a conversation to view messages</p>
              </div>
            )}

            {/* Manual Send */}
            <div
              className="rounded-2xl p-6"
              style={{ background: 'white', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-2 mb-4">
                <Send size={16} style={{ color: '#25D366' }} />
                <h3 className="font-medium" style={{ color: 'var(--charcoal)' }}>
                  Send WhatsApp Message
                </h3>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs mb-1.5 block" style={{ color: 'var(--muted)' }}>
                    Phone Number (without +91)
                  </label>
                  <input
                    type="text"
                    placeholder="9051459463"
                    value={sendPhone}
                    onChange={e => setSendPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ border: '1px solid var(--border)', fontFamily: 'var(--font-body)' }}
                  />
                </div>

                <div>
                  <label className="text-xs mb-1.5 block" style={{ color: 'var(--muted)' }}>
                    Quick Templates
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_TEMPLATES.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTemplate(t.id === selectedTemplate ? '' : t.id)}
                        className="text-xs px-3 py-1.5 rounded-lg transition-all"
                        style={{
                          background: selectedTemplate === t.id ? 'rgba(201,168,76,0.1)' : 'var(--cream)',
                          border: `1px solid ${selectedTemplate === t.id ? 'var(--gold)' : 'var(--border)'}`,
                          color: selectedTemplate === t.id ? 'var(--gold-dark)' : 'var(--slate)',
                        }}
                        title={t.desc}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs mb-1.5 block" style={{ color: 'var(--muted)' }}>
                    Custom Message (or leave blank to use template)
                  </label>
                  <textarea
                    value={sendMessage}
                    onChange={e => setSendMessage(e.target.value)}
                    placeholder="Type a custom message..."
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                    style={{ border: '1px solid var(--border)', fontFamily: 'var(--font-body)' }}
                  />
                </div>

                <button
                  onClick={sendManualMessage}
                  disabled={isSending || !sendPhone.trim()}
                  className="px-5 py-2.5 rounded-lg text-white text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                  style={{ background: '#25D366' }}
                >
                  {isSending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                  Send WhatsApp
                </button>

                {sendResult && (
                  <div
                    className={`text-sm px-3 py-2 rounded-lg ${
                      sendResult.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                    }`}
                  >
                    {sendResult}
                  </div>
                )}
              </div>
            </div>

            {/* Campaigns */}
            <div
              className="rounded-2xl p-6"
              style={{ background: 'white', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-2 mb-4">
                <Megaphone size={16} style={{ color: 'var(--gold)' }} />
                <h3 className="font-medium" style={{ color: 'var(--charcoal)' }}>
                  WhatsApp Campaigns
                </h3>
                <span
                  className="text-xs px-2 py-0.5 rounded-full ml-auto"
                  style={{ background: '#fff3cd', color: '#856404' }}
                >
                  Requires approved templates
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-xs mb-1.5 block" style={{ color: 'var(--muted)' }}>
                    Campaign Type
                  </label>
                  <select
                    value={activeCampaignType}
                    onChange={e => setActiveCampaignType(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ border: '1px solid var(--border)', background: 'white' }}
                  >
                    <option value="followup">Follow-up (not contacted 48h)</option>
                    <option value="festival">Festival / Seasonal Promo</option>
                    <option value="reengagement">Re-engage Cold Leads</option>
                    <option value="review_request">Post-Event Review Request</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs mb-1.5 block" style={{ color: 'var(--muted)' }}>
                    Target Segment
                  </label>
                  <select
                    value={campaignSegment}
                    onChange={e => setCampaignSegment(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ border: '1px solid var(--border)', background: 'white' }}
                  >
                    <option value="all">All Leads</option>
                    <option value="new_inquiry">New Inquiries</option>
                    <option value="followup_pending">Follow-up Pending</option>
                    <option value="future_prospect">Future Prospects</option>
                    <option value="confirmed">Confirmed (for reviews)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-4 mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isDryRun}
                    onChange={e => setIsDryRun(e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm" style={{ color: 'var(--slate)' }}>
                    Dry Run (count only, don't send)
                  </span>
                </label>
              </div>

              <button
                onClick={runCampaign}
                disabled={isCampaigning}
                className={`px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50 ${
                  isDryRun ? '' : 'text-white'
                }`}
                style={{
                  background: isDryRun
                    ? 'var(--cream)'
                    : 'linear-gradient(135deg, #c9a84c, #a07a28)',
                  border: isDryRun ? '1px solid var(--border)' : 'none',
                  color: isDryRun ? 'var(--charcoal)' : undefined,
                }}
              >
                {isCampaigning ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : isDryRun ? (
                  <Users size={14} />
                ) : (
                  <Megaphone size={14} />
                )}
                {isDryRun ? 'Preview Recipients' : '🚀 Send Campaign'}
              </button>

              {campaignResult && (
                <div
                  className="mt-3 p-3 rounded-lg text-sm"
                  style={{
                    background: campaignResult.error ? '#fef2f2' : '#f0fdf4',
                    color: campaignResult.error ? '#dc2626' : '#16a34a',
                  }}
                >
                  {campaignResult.error ? (
                    `❌ ${campaignResult.error}`
                  ) : campaignResult.dryRun ? (
                    <>
                      <p className="font-medium">📊 Preview: {campaignResult.count} eligible recipients</p>
                      {campaignResult.sample?.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {campaignResult.sample.map((r: any, i: number) => (
                            <p key={i} className="text-xs opacity-80">
                              • {r.name || 'Unknown'} — {r.phone}
                            </p>
                          ))}
                          {campaignResult.count > campaignResult.sample.length && (
                            <p className="text-xs opacity-60">
                              ...and {campaignResult.count - campaignResult.sample.length} more
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    `✅ Campaign complete: ${campaignResult.sent} sent, ${campaignResult.failed} failed`
                  )}
                </div>
              )}
            </div>

            {/* Setup Instructions */}
            <div
              className="rounded-2xl p-6"
              style={{
                background: 'rgba(201,168,76,0.05)',
                border: '1px solid rgba(201,168,76,0.2)',
              }}
            >
              <h3 className="font-medium mb-3 flex items-center gap-2" style={{ color: 'var(--charcoal)' }}>
                <Zap size={16} style={{ color: 'var(--gold)' }} />
                Webhook Setup (Do Once)
              </h3>
              <div className="text-sm space-y-2" style={{ color: 'var(--slate)' }}>
                <p>1. Go to your <strong>Wati.io Dashboard</strong> → Settings → Webhooks</p>
                <p>2. Set webhook URL to:</p>
                <code
                  className="block px-3 py-2 rounded text-xs mt-1"
                  style={{ background: '#0f1923', color: '#c9a84c' }}
                >
                  {typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.vercel.app'}/api/whatsapp/webhook
                </code>
                <p className="mt-2">3. Add these env vars:</p>
                <code
                  className="block px-3 py-2 rounded text-xs"
                  style={{ background: '#0f1923', color: '#c9a84c' }}
                >
                  WATI_BASE_URL=https://live-server-XXXXX.wati.io{'\n'}
                  WATI_API_TOKEN=your-token{'\n'}
                  WATI_VERIFY_TOKEN=any-secret-string{'\n'}
                  WATI_WEBHOOK_SECRET=optional-hmac-secret
                </code>
                <p className="mt-2">4. Redeploy on Vercel — AI auto-replies are now active! 🎉</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
