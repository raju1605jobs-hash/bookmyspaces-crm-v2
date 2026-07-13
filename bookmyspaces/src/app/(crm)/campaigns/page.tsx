'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Megaphone,
  Plus,
  Send,
  Users,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  BarChart3,
  Trash2,
  Eye,
  RefreshCw,
  Brain,
  Calendar,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Campaign {
  id: string
  name: string
  type: string
  status: 'draft' | 'scheduled' | 'running' | 'completed' | 'failed'
  message_template: string
  recipient_count: number
  sent_count: number
  delivered_count: number
  failed_count: number
  reply_count: number
  created_at: string
  scheduled_at?: string
  sent_at?: string
}

type CampaignType =
  | 'festival'
  | 'followup'
  | 'reengagement'
  | 'offer'
  | 'review_request'
  | 'custom'

interface NewCampaign {
  name: string
  type: CampaignType
  message_template: string
  segment: {
    status?: string
    min_score?: number
    source?: string
  }
  scheduled_at: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  Campaign['status'],
  { label: string; color: string; icon: React.ElementType }
> = {
  draft: { label: 'Draft', color: 'text-gray-600 bg-gray-100', icon: Clock },
  scheduled: { label: 'Scheduled', color: 'text-blue-700 bg-blue-100', icon: Calendar },
  running: { label: 'Running', color: 'text-yellow-700 bg-yellow-100', icon: Loader2 },
  completed: { label: 'Completed', color: 'text-green-700 bg-green-100', icon: CheckCircle },
  failed: { label: 'Failed', color: 'text-red-700 bg-red-100', icon: XCircle },
}

const CAMPAIGN_TYPES: { value: CampaignType; label: string }[] = [
  { value: 'festival', label: 'Festival / Holiday' },
  { value: 'followup', label: 'Follow-Up' },
  { value: 'reengagement', label: 'Re-engagement' },
  { value: 'offer', label: 'Special Offer' },
  { value: 'review_request', label: 'Review Request' },
  { value: 'custom', label: 'Custom' },
]

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string
  value: string | number
  icon: React.ElementType
  color: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
        <div className={`p-1.5 rounded-lg ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  )
}

// ─── Campaign Row ─────────────────────────────────────────────────────────────

function CampaignRow({
  campaign,
  onDelete,
}: {
  campaign: Campaign
  onDelete: (id: string) => void
}) {
  const cfg = STATUS_CONFIG[campaign.status]
  const Icon = cfg.icon
  const deliveryRate =
    campaign.sent_count > 0
      ? Math.round((campaign.delivered_count / campaign.sent_count) * 100)
      : 0

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3">
        <p className="text-sm font-medium text-gray-900">{campaign.name}</p>
        <p className="text-xs text-gray-500 capitalize">{campaign.type.replace('_', ' ')}</p>
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
          <Icon className="w-3 h-3" />
          {cfg.label}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 text-right">
        {campaign.recipient_count.toLocaleString()}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 text-right">
        {campaign.sent_count.toLocaleString()}
      </td>
      <td className="px-4 py-3 text-right">
        <span className={`text-sm font-medium ${deliveryRate >= 90 ? 'text-green-600' : deliveryRate >= 70 ? 'text-yellow-600' : 'text-red-600'}`}>
          {campaign.sent_count > 0 ? `${deliveryRate}%` : '—'}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-500 text-right">
        {campaign.reply_count}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <button
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="View details"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(campaign.id)}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete campaign"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  )
}

// ─── Create Campaign Modal ────────────────────────────────────────────────────

function CreateModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (data: NewCampaign) => Promise<void>
}) {
  const [form, setForm] = useState<NewCampaign>({
    name: '',
    type: 'followup',
    message_template: '',
    segment: {},
    scheduled_at: '',
  })
  const [dryRun, setDryRun] = useState(false)
  const [dryRunCount, setDryRunCount] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [counting, setCounting] = useState(false)

  async function handleDryRun() {
    setCounting(true)
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, dry_run: true }),
      })
      const data = await res.json()
      setDryRunCount(data.count ?? 0)
    } catch {
      setDryRunCount(null)
    } finally {
      setCounting(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await onCreate(form)
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">New Campaign</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-700">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Name</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Durga Puja Special Offer"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as CampaignType }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CAMPAIGN_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Message Template</label>
            <textarea
              required
              rows={4}
              value={form.message_template}
              onChange={(e) => setForm((p) => ({ ...p, message_template: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Hi {{name}}, BookMySpaces has a special offer for you this festive season..."
            />
            <p className="mt-1 text-xs text-gray-400">
              Use {'{{name}}'} as a placeholder for the customer name.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Schedule Date &amp; Time (optional)
            </label>
            <input
              type="datetime-local"
              value={form.scheduled_at}
              onChange={(e) => setForm((p) => ({ ...p, scheduled_at: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Dry run section */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <input
              type="checkbox"
              id="dry-run"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className="rounded border-gray-300 text-blue-600"
            />
            <label htmlFor="dry-run" className="text-sm text-gray-700 flex-1">
              Dry run (count only, do not send)
            </label>
            {dryRun && (
              <button
                type="button"
                onClick={handleDryRun}
                disabled={counting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 disabled:opacity-60"
              >
                {counting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Users className="w-3 h-3" />}
                Count Recipients
              </button>
            )}
          </div>

          {dryRunCount !== null && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">
              <CheckCircle className="w-4 h-4" />
              {dryRunCount} recipient{dryRunCount !== 1 ? 's' : ''} would receive this message.
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || dryRun}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {submitting ? 'Creating...' : 'Create Campaign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [summaryResult, setSummaryResult] = useState<string | null>(null)

  const fetchCampaigns = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/campaigns')
      const data = await res.json()
      setCampaigns(Array.isArray(data) ? data : data.campaigns ?? [])
    } catch {
      setCampaigns([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCampaigns()
  }, [fetchCampaigns])

  async function handleCreate(form: NewCampaign) {
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      await fetchCampaigns()
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this campaign?')) return
    await fetch(`/api/campaigns?id=${id}`, { method: 'DELETE' })
    setCampaigns((prev) => prev.filter((c) => c.id !== id))
  }

  async function handleGenerateSummary() {
    setGenerating(true)
    setSummaryResult(null)
    try {
      const res = await fetch('/api/ai-summary', { method: 'POST' })
      const data = await res.json()
      setSummaryResult(data.summary ?? data.message ?? 'Summary generated successfully.')
    } catch {
      setSummaryResult('Failed to generate summary. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  // Aggregate stats
  const totalSent = campaigns.reduce((s, c) => s + c.sent_count, 0)
  const totalDelivered = campaigns.reduce((s, c) => s + c.delivered_count, 0)
  const totalReplies = campaigns.reduce((s, c) => s + c.reply_count, 0)
  const activeCampaigns = campaigns.filter((c) => c.status === 'running' || c.status === 'scheduled').length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Megaphone className="w-6 h-6 text-gray-700" />
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Campaigns</h1>
              <p className="text-sm text-gray-500">WhatsApp broadcast campaigns</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchCampaigns}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={handleGenerateSummary}
              disabled={generating}
              className="flex items-center gap-2 px-3 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Brain className="w-4 h-4" />
              )}
              Generate Today&apos;s Summary
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              New Campaign
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* AI Summary Result */}
        {summaryResult && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-start gap-2">
              <Brain className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-blue-800">{summaryResult}</p>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Campaigns" value={campaigns.length} icon={Megaphone} color="bg-purple-50 text-purple-600" />
          <StatCard label="Active" value={activeCampaigns} icon={Clock} color="bg-blue-50 text-blue-600" />
          <StatCard label="Messages Sent" value={totalSent.toLocaleString()} icon={Send} color="bg-green-50 text-green-600" />
          <StatCard label="Total Replies" value={totalReplies.toLocaleString()} icon={BarChart3} color="bg-yellow-50 text-yellow-600" />
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">All Campaigns</h2>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-16">
              <Megaphone className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No campaigns yet.</p>
              <button
                onClick={() => setShowCreate(true)}
                className="mt-3 text-sm text-blue-600 hover:underline"
              >
                Create your first campaign
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Campaign</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Recipients</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Sent</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Delivery</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Replies</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {campaigns.map((c) => (
                    <CampaignRow key={c.id} campaign={c} onDelete={handleDelete} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && campaigns.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 text-right">
              <span className="text-xs text-gray-400">
                {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''} — {totalDelivered.toLocaleString()} total deliveries
              </span>
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />
      )}
    </div>
  )
}
