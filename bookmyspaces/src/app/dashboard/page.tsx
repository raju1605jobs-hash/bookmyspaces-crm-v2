'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Search,
  Plus,
  Filter,
  RefreshCw,
  Phone,
  Mail,
  Calendar,
  Users,
  TrendingUp,
  CheckCircle,
  Clock,
  AlertCircle,
  BarChart3,
  MessageSquare,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'

// Fallback used when lead.status is undefined, null, or an unknown value
const STATUS_FALLBACK = { label: 'Unknown', color: '#6b7280', bg: '#f3f4f6' }

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  new_inquiry: { label: 'New Inquiry', color: '#2563eb', bg: '#eff6ff' },
  followup_pending: { label: 'Follow-up', color: '#d97706', bg: '#fffbeb' },
  proposal_sent: { label: 'Proposal Sent', color: '#7c3aed', bg: '#f5f3ff' },
  negotiation: { label: 'Negotiation', color: '#ea580c', bg: '#fff7ed' },
  confirmed: { label: 'Confirmed ✓', color: '#16a34a', bg: '#f0fdf4' },
  rejected: { label: 'Rejected', color: '#dc2626', bg: '#fef2f2' },
  future_prospect: { label: 'Future Prospect', color: '#4b5563', bg: '#f9fafb' },
}

// Safe getter — never crashes on undefined/null/unknown status
const getStatus = (status: string | undefined | null) =>
  STATUS_CONFIG[status ?? ''] ?? STATUS_FALLBACK

const ALL_STATUSES = [
  'new_inquiry',
  'followup_pending',
  'proposal_sent',
  'negotiation',
  'confirmed',
  'rejected',
  'future_prospect',
]

export default function DashboardPage() {
  const [leads, setLeads] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedLead, setSelectedLead] = useState<any | null>(null)
  const [activeTab, setActiveTab] = useState<'list' | 'kanban' | 'stats'>('list')

  const fetchLeads = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (search) params.set('search', search)
      params.set('limit', '100')

      const res = await fetch(`/api/leads?${params}`)
      const data = await res.json()
      setLeads(data.leads || [])
      setTotal(data.total || 0)
    } catch (err) {
      // Silent failure — UI shows empty state
    } finally {
      setIsLoading(false)
    }
  }, [statusFilter, search])

  useEffect(() => {
    fetchLeads()
  }, [fetchLeads])

  const updateLeadStatus = async (id: string, status: any) => {
    await fetch('/api/leads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    fetchLeads()
    if (selectedLead?.id === id) {
      setSelectedLead((prev: any) => prev ? { ...prev, status } : null)
    }
  }

  // Stats
  const stats = {
    total: leads.length,
    new: leads.filter(l => l.status === 'new_inquiry').length,
    confirmed: leads.filter(l => l.status === 'confirmed').length,
    pending: leads.filter(l => l.status === 'followup_pending').length,
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--cream)', fontFamily: 'var(--font-body)' }}
    >
      {/* Top Navigation */}
      <nav
        className="sticky top-0 z-40 px-6 py-4 flex items-center justify-between"
        style={{
          background: 'rgba(248,245,240,0.9)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="text-xl font-light"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}
          >
            BookMySpaces
            <span className="text-sm ml-2 font-normal" style={{ color: 'var(--gold)' }}>
              CRM
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchLeads}
            className="p-2 rounded-lg hover:bg-white transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} style={{ color: 'var(--slate)' }} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <a
            href="/whatsapp"
            className="text-sm px-4 py-2 rounded-lg transition-all"
            style={{ color: '#25D366', border: '1px solid #25D36640', background: '#25D36608' }}
          >
            WhatsApp
          </a>
          <a
            href="/kanban"
            className="text-sm px-4 py-2 rounded-lg transition-all"
            style={{ color: 'var(--slate)', border: '1px solid var(--border)', background: 'white' }}
          >
            Kanban
          </a>
          <a
            href="/proposals"
            className="text-sm px-4 py-2 rounded-lg transition-all"
            style={{ color: 'var(--slate)', border: '1px solid var(--border)', background: 'white' }}
          >
            Proposals
          </a>
          <a
            href="/analytics"
            className="text-sm px-4 py-2 rounded-lg transition-all"
            style={{ color: 'var(--slate)', border: '1px solid var(--border)', background: 'white' }}
          >
            Analytics
          </a>
          <a
            href="/campaigns"
            className="text-sm px-4 py-2 rounded-lg transition-all"
            style={{ color: 'var(--slate)', border: '1px solid var(--border)', background: 'white' }}
          >
            Campaigns
          </a>
          <a
            href="/settings"
            className="text-sm px-4 py-2 rounded-lg transition-all"
            style={{ color: 'var(--slate)', border: '1px solid var(--border)', background: 'white' }}
          >
            Settings
          </a>
          <a
            href="/"
            className="text-sm px-4 py-2 rounded-lg transition-all"
            style={{ color: 'var(--slate)', border: '1px solid var(--border)', background: 'white' }}
          >
            ← Website
          </a>
          <a
            href="/admin"
            className="text-sm px-4 py-2 rounded-lg text-white transition-all"
            style={{ background: 'linear-gradient(135deg, #c9a84c, #a07a28)' }}
          >
            Admin Panel
          </a>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header + Stats */}
        <div className="mb-8">
          <h1
            className="text-3xl font-light mb-2"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}
          >
            Inquiry Dashboard
          </h1>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {total} total leads · {stats.new} new · {stats.confirmed} confirmed
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            {
              label: 'Total Leads',
              value: stats.total,
              icon: <Users size={18} />,
              color: '#2563eb',
              bg: '#eff6ff',
            },
            {
              label: 'New Inquiries',
              value: stats.new,
              icon: <MessageSquare size={18} />,
              color: '#d97706',
              bg: '#fffbeb',
            },
            {
              label: 'Follow-ups',
              value: stats.pending,
              icon: <Clock size={18} />,
              color: '#7c3aed',
              bg: '#f5f3ff',
            },
            {
              label: 'Confirmed',
              value: stats.confirmed,
              icon: <CheckCircle size={18} />,
              color: '#16a34a',
              bg: '#f0fdf4',
            },
          ].map(stat => (
            <div
              key={stat.label}
              className="rounded-xl p-5 card-hover"
              style={{ background: 'white', border: '1px solid var(--border)' }}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
                style={{ background: stat.bg, color: stat.color }}
              >
                {stat.icon}
              </div>
              <div
                className="text-2xl font-semibold"
                style={{ color: 'var(--charcoal)', fontFamily: 'var(--font-display)' }}
              >
                {stat.value}
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-3 mb-6">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg flex-1 min-w-[200px]"
            style={{ background: 'white', border: '1px solid var(--border)' }}
          >
            <Search size={15} style={{ color: 'var(--muted)' }} />
            <input
              type="text"
              placeholder="Search name, phone, email, event..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 text-sm outline-none"
              style={{ background: 'transparent', color: 'var(--charcoal)', fontFamily: 'var(--font-body)' }}
            />
          </div>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm outline-none"
            style={{
              background: 'white',
              border: '1px solid var(--border)',
              color: 'var(--charcoal)',
              fontFamily: 'var(--font-body)',
            }}
          >
            <option value="all">All Statuses</option>
            {ALL_STATUSES.map(s => (
              <option key={s} value={s}>
                {STATUS_CONFIG[s].label}
              </option>
            ))}
          </select>
        </div>

        {/* Leads Table */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: 'white', border: '1px solid var(--border)' }}
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="animate-spin" size={24} style={{ color: 'var(--gold)' }} />
            </div>
          ) : leads.length === 0 ? (
            <div className="text-center py-16" style={{ color: 'var(--muted)' }}>
              <AlertCircle size={40} className="mx-auto mb-3 opacity-40" />
              <p className="font-medium">No leads found</p>
              <p className="text-sm mt-1">
                {search || statusFilter !== 'all' ? 'Try adjusting your filters' : 'Leads from the chatbot will appear here automatically'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--cream)' }}>
                    {['Guest', 'Contact', 'Event', 'Date', 'Guests', 'Budget', 'Status', 'Source', 'Actions'].map(h => (
                      <th
                        key={h}
                        className="text-left px-4 py-3 text-xs font-medium tracking-wider uppercase"
                        style={{ color: 'var(--muted)' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead, i) => (
                    <tr
                      key={lead.id}
                      className="cursor-pointer transition-colors hover:bg-amber-50/30"
                      style={{ borderBottom: i < leads.length - 1 ? '1px solid var(--border)' : 'none' }}
                      onClick={() => setSelectedLead(lead)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-sm" style={{ color: 'var(--charcoal)' }}>
                          {lead.name || <span style={{ color: 'var(--muted)' }}>Unknown</span>}
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                          {format(parseISO(lead.created_at), 'dd MMM, HH:mm')}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {lead.phone && (
                          <a
                            href={`https://wa.me/91${lead.phone}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="flex items-center gap-1 text-xs hover:underline mb-1"
                            style={{ color: '#16a34a' }}
                          >
                            <Phone size={11} />
                            {lead.phone}
                          </a>
                        )}
                        {lead.email && (
                          <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--muted)' }}>
                            <Mail size={11} />
                            {lead.email}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm" style={{ color: 'var(--charcoal)' }}>
                          {lead.event_type || '—'}
                        </span>
                        {lead.venue && (
                          <div className="text-xs mt-0.5" style={{ color: 'var(--gold)' }}>
                            {lead.venue}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--slate)' }}>
                        {lead.event_date ? format(parseISO(lead.event_date), 'dd MMM yy') : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--slate)' }}>
                        {lead.guest_count ? `${lead.guest_count} pax` : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--slate)' }}>
                        {lead.budget || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={lead.status}
                          onChange={e => {
                            e.stopPropagation()
                            updateLeadStatus(lead.id, e.target.value as any)
                          }}
                          onClick={e => e.stopPropagation()}
                          className="text-xs px-2 py-1 rounded-full font-medium outline-none"
                          style={{
                            color: getStatus(lead.status).color,
                            background: getStatus(lead.status).bg,
                            border: `1px solid ${getStatus(lead.status).color}30`,
                            fontFamily: 'var(--font-body)',
                          }}
                        >
                          {ALL_STATUSES.map(s => (
                            <option key={s} value={s}>
                              {STATUS_CONFIG[s].label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: '#f3f4f6', color: '#6b7280' }}
                        >
                          {lead.source}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {lead.phone && (
                          <a
                            href={`https://wa.me/91${lead.phone}?text=Hi ${lead.name || 'there'}! Following up on your event inquiry at BookMySpaces. How can I help you? 😊`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="text-xs px-3 py-1.5 rounded-lg text-white flex items-center gap-1 w-fit"
                            style={{ background: '#25D366' }}
                          >
                            <Phone size={11} />
                            Chat
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* any Detail Sidebar */}
      {selectedLead && (
        <div
          className="fixed inset-y-0 right-0 w-full max-w-md z-50 overflow-y-auto shadow-2xl"
          style={{ background: 'white', borderLeft: '1px solid var(--border)' }}
        >
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2
                className="text-xl font-light"
                style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}
              >
                any Details
              </h2>
              <button
                onClick={() => setSelectedLead(null)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-5">
              {/* Status */}
              <div>
                <label className="text-xs uppercase tracking-wider mb-2 block" style={{ color: 'var(--muted)' }}>
                  Pipeline Status
                </label>
                <select
                  value={selectedLead.status}
                  onChange={e => updateLeadStatus(selectedLead.id, e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{
                    border: '1px solid var(--border)',
                    fontFamily: 'var(--font-body)',
                    color: 'var(--charcoal)',
                  }}
                >
                  {ALL_STATUSES.map(s => (
                    <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                  ))}
                </select>
              </div>

              {/* Contact Info */}
              <InfoSection title="Guest Information">
                <InfoRow label="Name" value={selectedLead.name} />
                <InfoRow
                  label="Phone"
                  value={selectedLead.phone}
                  link={`https://wa.me/91${selectedLead.phone}`}
                />
                <InfoRow label="Email" value={selectedLead.email} />
                <InfoRow label="Source" value={selectedLead.source} />
              </InfoSection>

              {/* Event Info */}
              <InfoSection title="Event Details">
                <InfoRow label="Event Type" value={selectedLead.event_type} />
                <InfoRow label="Event Date" value={selectedLead.event_date ? format(parseISO(selectedLead.event_date), 'dd MMMM yyyy') : null} />
                <InfoRow label="Guest Count" value={selectedLead.guest_count ? `${selectedLead.guest_count} guests` : null} />
                <InfoRow label="Budget" value={selectedLead.budget} />
                <InfoRow label="Venue" value={selectedLead.venue} />
                <InfoRow label="Special Requirements" value={selectedLead.special_requirements} />
              </InfoSection>

              {/* Summary */}
              {selectedLead.inquiry_summary && (
                <InfoSection title="AI Summary">
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--slate)' }}>
                    {selectedLead.inquiry_summary}
                  </p>
                </InfoSection>
              )}

              {/* Notes */}
              <div>
                <label className="text-xs uppercase tracking-wider mb-2 block" style={{ color: 'var(--muted)' }}>
                  Staff Notes
                </label>
                <textarea
                  defaultValue={selectedLead.notes || ''}
                  placeholder="Add notes about this lead..."
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                  style={{
                    border: '1px solid var(--border)',
                    fontFamily: 'var(--font-body)',
                    color: 'var(--charcoal)',
                  }}
                  onBlur={async e => {
                    await fetch('/api/leads', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ id: selectedLead.id, notes: e.target.value }),
                    })
                  }}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                {selectedLead.phone && (
                  <>
                    <a
                      href={`https://wa.me/91${selectedLead.phone}?text=Hi ${selectedLead.name || 'there'}! Following up on your inquiry at BookMySpaces. How can I assist you today? 😊`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-center py-2.5 rounded-lg text-white text-sm font-medium"
                      style={{ background: '#25D366' }}
                    >
                      WhatsApp
                    </a>
                    <a
                      href={`tel:${selectedLead.phone}`}
                      className="flex-1 text-center py-2.5 rounded-lg text-sm font-medium border"
                      style={{ borderColor: 'var(--border)', color: 'var(--charcoal)' }}
                    >
                      Call
                    </a>
                  </>
                )}
              </div>

              <div className="text-xs pt-2" style={{ color: 'var(--muted)' }}>
                Created: {format(parseISO(selectedLead.created_at), 'dd MMM yyyy, HH:mm')}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedLead && (
        <div
          className="fixed inset-0 z-40 bg-black/20"
          onClick={() => setSelectedLead(null)}
        />
      )}
    </div>
  )
}

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs uppercase tracking-wider mb-3" style={{ color: 'var(--muted)' }}>
        {title}
      </h3>
      <div
        className="rounded-xl overflow-hidden divide-y"
        style={{ border: '1px solid var(--border)' }}
      >
        {children}
      </div>
    </div>
  )
}

function InfoRow({
  label,
  value,
  link,
}: {
  label: string
  value: string | number | null | undefined
  link?: string
}) {
  if (!value) return null

  return (
    <div className="flex items-start justify-between px-4 py-2.5 gap-3">
      <span className="text-xs flex-shrink-0 pt-0.5" style={{ color: 'var(--muted)', minWidth: '100px' }}>
        {label}
      </span>
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-right hover:underline"
          style={{ color: '#16a34a' }}
        >
          {value}
        </a>
      ) : (
        <span className="text-sm text-right" style={{ color: 'var(--charcoal)' }}>
          {value}
        </span>
      )}
    </div>
  )
}
