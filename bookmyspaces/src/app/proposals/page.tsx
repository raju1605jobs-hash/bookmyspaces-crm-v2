'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  FileText, Sparkles, Eye, Send, ChevronDown, Plus, Trash2,
  RefreshCw, CheckCircle, AlertCircle, Calculator, Download
} from 'lucide-react'

const VENUES = ['Monurama Rooftop', 'Monurama Banquet', 'Monurama Private Dining', 'Skyline Serenity']
const EVENT_TYPES = ['Birthday Party', 'Anniversary', 'Engagement', 'Corporate Event', 'Private Dinner', 'Get-together', 'Baby Shower', 'Farewell', 'Other']

const PACKAGES = [
  { name: 'Silver', price: 42000, guests: 60, hours: 4 },
  { name: 'Gold', price: 50000, guests: 60, hours: 4 },
  { name: 'Platinum', price: 59500, guests: 60, hours: 5 },
  { name: 'Custom', price: 0, guests: 0, hours: 0 },
]

const ADDON_OPTIONS = [
  { id: 'photography', label: '📷 Photography', price: 8000 },
  { id: 'music', label: '🎵 Music Setup', price: 6000 },
  { id: 'theme_decoration', label: '🎨 Theme Decoration', price: 8500 },
]

interface Addon { name: string; price: number }

interface ProposalForm {
  client_name: string
  client_phone: string
  client_email: string
  event_type: string
  event_date: string
  event_time: string
  guest_count: string
  venue: string
  package_name: string
  base_price: string
  addons: Addon[]
  discount_amount: string
  discount_reason: string
  special_requirements: string
  lead_id: string
}

function ProposalBuilderInner() {
  const searchParams = useSearchParams()

  const [form, setForm] = useState<ProposalForm>({
    client_name: searchParams.get('name') || '',
    client_phone: searchParams.get('phone') || '',
    client_email: '',
    event_type: searchParams.get('event') || '',
    event_date: searchParams.get('date') || '',
    event_time: '',
    guest_count: searchParams.get('guests') || '',
    venue: 'Monurama Rooftop',
    package_name: 'Gold',
    base_price: '50000',
    addons: [],
    discount_amount: '',
    discount_reason: '',
    special_requirements: '',
    lead_id: searchParams.get('lead_id') || '',
  })

  const [isCreating, setIsCreating] = useState(false)
  const [createdProposal, setCreatedProposal] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [recentProposals, setRecentProposals] = useState<any[]>([])
  const [isLoadingProposals, setIsLoadingProposals] = useState(true)

  useEffect(() => {
    fetchRecentProposals()
  }, [])

  const fetchRecentProposals = async () => {
    setIsLoadingProposals(true)
    try {
      const res = await fetch('/api/proposals')
      const data = await res.json()
      setRecentProposals(data.proposals || [])
    } finally {
      setIsLoadingProposals(false)
    }
  }

  const set = (key: keyof ProposalForm, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }))

  const selectPackage = (pkg: typeof PACKAGES[0]) => {
    setForm(prev => ({
      ...prev,
      package_name: pkg.name,
      base_price: pkg.price.toString(),
    }))
  }

  const toggleAddon = (addon: typeof ADDON_OPTIONS[0]) => {
    setForm(prev => {
      const exists = prev.addons.find(a => a.name === addon.label)
      if (exists) {
        return { ...prev, addons: prev.addons.filter(a => a.name !== addon.label) }
      } else {
        return { ...prev, addons: [...prev.addons, { name: addon.label, price: addon.price }] }
      }
    })
  }

  const addCustomAddon = () => {
    setForm(prev => ({
      ...prev,
      addons: [...prev.addons, { name: '', price: 0 }],
    }))
  }

  const updateCustomAddon = (index: number, field: 'name' | 'price', value: string) => {
    setForm(prev => ({
      ...prev,
      addons: prev.addons.map((a, i) =>
        i === index ? { ...a, [field]: field === 'price' ? parseFloat(value) || 0 : value } : a
      ),
    }))
  }

  const removeAddon = (index: number) => {
    setForm(prev => ({ ...prev, addons: prev.addons.filter((_, i) => i !== index) }))
  }

  // Live pricing calculation
  const basePrice = parseFloat(form.base_price) || 0
  const guestCount = parseInt(form.guest_count) || 0
  const addonsTotal = form.addons.reduce((s, a) => s + (a.price || 0), 0)
  const extraGuestCharge = guestCount > 60 ? (guestCount - 60) * 750 : 0
  const discountAmt = parseFloat(form.discount_amount) || 0
  const subtotal = basePrice + addonsTotal + extraGuestCharge
  const total = subtotal - discountAmt
  const advance = Math.round(total * 0.3)

  const createProposal = async () => {
    if (!form.client_name || !form.package_name || !basePrice) {
      setError('Client name, package, and base price are required')
      return
    }
    setIsCreating(true)
    setError(null)

    try {
      // Build addons including extra guest charge
      const allAddons = [...form.addons]
      if (extraGuestCharge > 0) {
        allAddons.push({ name: `Extra Guests (${guestCount - 60} × ₹750)`, price: extraGuestCharge })
      }

      const res = await fetch('/api/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          guest_count: guestCount || null,
          base_price: basePrice,
          addons: allAddons,
          discount_amount: discountAmt,
          total_price: total,
          advance_required: advance,
          generate_cover_note: true,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create proposal')
      setCreatedProposal(data.proposal)
      fetchRecentProposals()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsCreating(false)
    }
  }

  const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
    draft:    { color: '#6b7280', bg: '#f3f4f6' },
    sent:     { color: '#2563eb', bg: '#eff6ff' },
    viewed:   { color: '#7c3aed', bg: '#f5f3ff' },
    accepted: { color: '#16a34a', bg: '#f0fdf4' },
    rejected: { color: '#dc2626', bg: '#fef2f2' },
    expired:  { color: '#9ca3af', bg: '#f9fafb' },
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--cream)', fontFamily: 'var(--font-body)' }}>
      {/* Nav */}
      <nav className="sticky top-0 z-40 px-6 py-4 flex items-center justify-between"
        style={{ background: 'rgba(248,245,240,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)' }}>
        <div className="text-xl font-light" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          BookMySpaces <span className="text-sm" style={{ color: 'var(--gold)' }}>Proposals</span>
        </div>
        <div className="flex gap-2">
          <a href="/kanban" className="text-sm px-4 py-2 rounded-lg"
            style={{ border: '1px solid var(--border)', background: 'white', color: 'var(--slate)' }}>
            ← Kanban
          </a>
          <a href="/dashboard" className="text-sm px-4 py-2 rounded-lg"
            style={{ border: '1px solid var(--border)', background: 'white', color: 'var(--slate)' }}>
            ← CRM
          </a>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-3 gap-8">

          {/* ── BUILDER FORM ── */}
          <div className="lg:col-span-2 space-y-6">
            <div>
              <h1 className="text-3xl font-light" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                Proposal Builder
              </h1>
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                AI generates the cover note automatically. Fill details and click Create.
              </p>
            </div>

            {/* Client Details */}
            <FormCard title="Client Information">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Client Name *" value={form.client_name} onChange={v => set('client_name', v)} placeholder="Rahul Sharma" />
                <Field label="Phone" value={form.client_phone} onChange={v => set('client_phone', v)} placeholder="9051459463" />
                <Field label="Email" value={form.client_email} onChange={v => set('client_email', v)} placeholder="rahul@gmail.com" />
                <Field label="Lead ID (optional)" value={form.lead_id} onChange={v => set('lead_id', v)} placeholder="auto-links CRM record" />
              </div>
            </FormCard>

            {/* Event Details */}
            <FormCard title="Event Details">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs mb-1.5 block" style={{ color: 'var(--muted)' }}>Event Type</label>
                  <select value={form.event_type} onChange={e => set('event_type', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ border: '1px solid var(--border)', fontFamily: 'var(--font-body)', background: 'white' }}>
                    <option value="">Select type</option>
                    {EVENT_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs mb-1.5 block" style={{ color: 'var(--muted)' }}>Venue</label>
                  <select value={form.venue} onChange={e => set('venue', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ border: '1px solid var(--border)', fontFamily: 'var(--font-body)', background: 'white' }}>
                    {VENUES.map(v => <option key={v}>{v}</option>)}
                  </select>
                </div>
                <Field label="Event Date" value={form.event_date} onChange={v => set('event_date', v)} type="date" />
                <Field label="Event Time" value={form.event_time} onChange={v => set('event_time', v)} placeholder="7:00 PM onwards" />
                <Field label="Guest Count" value={form.guest_count} onChange={v => set('guest_count', v)} placeholder="50" type="number" />
              </div>
              {guestCount > 60 && (
                <div className="mt-3 px-3 py-2 rounded-lg text-sm"
                  style={{ background: '#fffbeb', color: '#d97706', border: '1px solid #fcd34d' }}>
                  ⚠️ {guestCount - 60} extra guests above 60 — ₹{((guestCount - 60) * 750).toLocaleString('en-IN')} additional charge applies
                </div>
              )}
              {guestCount > 70 && (
                <div className="mt-2 px-3 py-2 rounded-lg text-sm"
                  style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5' }}>
                  ❌ Guest count exceeds venue maximum capacity of 70
                </div>
              )}
            </FormCard>

            {/* Package Selection */}
            <FormCard title="Package">
              <div className="grid grid-cols-2 gap-3 mb-4">
                {PACKAGES.map(pkg => (
                  <button key={pkg.name} onClick={() => selectPackage(pkg)}
                    className="p-4 rounded-xl text-left transition-all"
                    style={{
                      border: form.package_name === pkg.name ? '2px solid var(--gold)' : '1px solid var(--border)',
                      background: form.package_name === pkg.name ? 'rgba(201,168,76,0.06)' : 'white',
                    }}>
                    <div className="font-medium text-sm" style={{ color: form.package_name === pkg.name ? 'var(--gold-dark)' : 'var(--charcoal)' }}>
                      {pkg.name}
                    </div>
                    {pkg.price > 0 ? (
                      <div className="text-lg font-light mt-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                        ₹{pkg.price.toLocaleString('en-IN')}
                      </div>
                    ) : (
                      <div className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Enter price below</div>
                    )}
                  </button>
                ))}
              </div>

              {form.package_name === 'Custom' && (
                <Field label="Custom Base Price (₹)" value={form.base_price} onChange={v => set('base_price', v)} type="number" placeholder="45000" />
              )}

              {/* Add-ons */}
              <div className="mt-4">
                <label className="text-xs uppercase tracking-wider mb-3 block" style={{ color: 'var(--muted)' }}>Add-ons</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {ADDON_OPTIONS.map(addon => {
                    const active = form.addons.some(a => a.name === addon.label)
                    return (
                      <button key={addon.id} onClick={() => toggleAddon(addon)}
                        className="text-sm px-3 py-2 rounded-lg transition-all"
                        style={{
                          border: active ? '1.5px solid var(--gold)' : '1px solid var(--border)',
                          background: active ? 'rgba(201,168,76,0.08)' : 'white',
                          color: active ? 'var(--gold-dark)' : 'var(--slate)',
                        }}>
                        {addon.label} <span style={{ color: 'var(--muted)', fontSize: '12px' }}>₹{addon.price.toLocaleString('en-IN')}</span>
                      </button>
                    )
                  })}
                  <button onClick={addCustomAddon}
                    className="text-sm px-3 py-2 rounded-lg flex items-center gap-1"
                    style={{ border: '1px dashed var(--border)', color: 'var(--muted)', background: 'transparent' }}>
                    <Plus size={12} /> Custom
                  </button>
                </div>

                {/* Custom addons */}
                {form.addons.filter(a => !ADDON_OPTIONS.some(o => o.label === a.name)).map((addon, i) => {
                  const realIndex = form.addons.indexOf(addon)
                  return (
                    <div key={realIndex} className="flex gap-2 mb-2">
                      <input value={addon.name} onChange={e => updateCustomAddon(realIndex, 'name', e.target.value)}
                        placeholder="Add-on name"
                        className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                        style={{ border: '1px solid var(--border)' }} />
                      <input value={addon.price || ''} onChange={e => updateCustomAddon(realIndex, 'price', e.target.value)}
                        placeholder="₹0" type="number"
                        className="w-24 px-3 py-2 rounded-lg text-sm outline-none"
                        style={{ border: '1px solid var(--border)' }} />
                      <button onClick={() => removeAddon(realIndex)}
                        className="p-2 rounded-lg hover:bg-red-50"
                        style={{ color: '#dc2626' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )
                })}
              </div>

              {/* Discount */}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Field label="Discount Amount (₹)" value={form.discount_amount} onChange={v => set('discount_amount', v)} type="number" placeholder="0" />
                <Field label="Discount Reason" value={form.discount_reason} onChange={v => set('discount_reason', v)} placeholder="Loyalty / Referral" />
              </div>
            </FormCard>

            {/* Special Requirements */}
            <FormCard title="Additional Notes">
              <div>
                <label className="text-xs mb-1.5 block" style={{ color: 'var(--muted)' }}>Special Requirements / Notes</label>
                <textarea value={form.special_requirements} onChange={e => set('special_requirements', e.target.value)}
                  placeholder="Any special arrangements, dietary requirements, decoration preferences..."
                  rows={3} className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                  style={{ border: '1px solid var(--border)', fontFamily: 'var(--font-body)' }} />
              </div>
            </FormCard>

            {error && (
              <div className="px-4 py-3 rounded-xl flex items-center gap-2 text-sm"
                style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5' }}>
                <AlertCircle size={15} /> {error}
              </div>
            )}

            <button onClick={createProposal} disabled={isCreating}
              className="w-full py-4 rounded-xl text-white font-medium flex items-center justify-center gap-3 text-base disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #c9a84c, #a07a28)' }}>
              {isCreating ? (
                <><RefreshCw size={18} className="animate-spin" /> AI is writing your proposal...</>
              ) : (
                <><Sparkles size={18} /> Create Proposal with AI Cover Note</>
              )}
            </button>

            {createdProposal && (
              <div className="p-5 rounded-xl"
                style={{ background: '#f0fdf4', border: '1px solid #86efac' }}>
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle size={18} className="text-green-600" />
                  <span className="font-medium text-green-800">Proposal {createdProposal.proposal_number} Created!</span>
                </div>
                <div className="flex gap-3">
                  <a href={`/api/proposals/${createdProposal.id}/preview`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-white"
                    style={{ background: '#0f1923' }}>
                    <Eye size={14} /> Preview
                  </a>
                  {createdProposal.share_token && (
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/proposal/share/${createdProposal.share_token}`
                        navigator.clipboard.writeText(url).then(() => alert('Share link copied!')).catch(() => {
                          prompt('Copy this link:', url)
                        })
                      }}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm"
                      style={{ border: '1px solid #c9a84c', color: '#a07a28', background: 'rgba(201,168,76,0.06)' }}>
                      🔗 Copy Share Link
                    </button>
                  )}
                  <a href={`/api/proposals/${createdProposal.id}/pdf`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-white"
                    style={{ background: 'var(--gold-dark, #a07a28)' }}>
                    <Download size={14} /> Download PDF
                  </a>
                  {(createdProposal.client_phone || createdProposal.leads?.phone) && (
                    <button
                      onClick={async () => {
                        // Target: CLIENT's phone — not our own business number
                        const clientPhone = (createdProposal.client_phone || createdProposal.leads?.phone || '')
                          .replace(/\D/g, '')                   // strip non-digits
                          .replace(/^91/, '')                    // remove 91 country code if present
                        const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin
                        const shareUrl = `${appUrl}/proposal/share/${createdProposal.share_token}`

                        // Professional sales message — formatted for readability on mobile
                        const clientName = createdProposal.client_name || createdProposal.leads?.name || ''
                        const eventDate = createdProposal.event_date
                          ? new Date(createdProposal.event_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
                          : ''

                        const message = [
                          `Hello ${clientName},`,
                          '',
                          'Thank you for choosing BookMySpaces 🌟',
                          'Please find your event proposal below:',
                          '',
                          `📄 Proposal: *${createdProposal.proposal_number}*`,
                          createdProposal.event_type ? `🎉 Event: ${createdProposal.event_type}` : '',
                          eventDate ? `📅 Date: ${eventDate}` : '',
                          createdProposal.total_price
                            ? `💰 Total: *₹${createdProposal.total_price.toLocaleString('en-IN')}*`
                            : '',
                          '',
                          `🔗 View Proposal: ${shareUrl}`,
                          '',
                          'Please reply *CONFIRM* to proceed with booking.',
                          '',
                          'Warm regards,',
                          'BookMySpaces',
                          '📞 9051459463 | www.bookmyspaces.in',
                        ].filter(Boolean).join('\n')

                        // Track delivery — non-blocking
                        fetch('/api/proposals', {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ id: createdProposal.id, action: 'whatsapp_sent' }),
                        }).catch(() => {})

                        // Open WhatsApp to CLIENT's number (desktop + mobile compatible)
                        const waUrl = `https://wa.me/91${clientPhone}?text=${encodeURIComponent(message)}`
                        window.open(waUrl, '_blank', 'noopener,noreferrer')
                      }}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-white"
                      style={{ background: '#25D366' }}>
                      <Send size={14} /> Send Proposal on WhatsApp
                    </button>
                  )}
                  {createdProposal.client_email && (
                    <button
                      onClick={async () => {
                        const res = await fetch('/api/proposals/email', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ proposal_id: createdProposal.id }),
                        })
                        const data = await res.json()
                        if (data.mailto_url) window.open(data.mailto_url, '_blank')
                        else if (data.success) alert('Email sent successfully!')
                      }}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm"
                      style={{ background: '#fff', border: '1px solid #e5e7eb', color: '#374151' }}>
                      <Send size={14} /> Send via Email
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── SIDEBAR: Live Pricing + Recent ── */}
          <div className="space-y-6">
            {/* Live Pricing */}
            <div className="rounded-2xl p-6 sticky top-24"
              style={{ background: 'white', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 mb-5">
                <Calculator size={16} style={{ color: 'var(--gold)' }} />
                <h3 className="font-medium" style={{ color: 'var(--charcoal)' }}>Live Pricing</h3>
              </div>

              <div className="space-y-3">
                <PricingRow label={`${form.package_name} Package`} amount={basePrice} />
                {form.addons.map((a, i) => (
                  <PricingRow key={i} label={a.name || 'Add-on'} amount={a.price} muted />
                ))}
                {extraGuestCharge > 0 && (
                  <PricingRow label={`Extra Guests (${guestCount - 60} pax)`} amount={extraGuestCharge} muted />
                )}
                {discountAmt > 0 && (
                  <PricingRow label={`Discount${form.discount_reason ? ` (${form.discount_reason})` : ''}`} amount={-discountAmt} green />
                )}

                <div className="border-t pt-3 mt-3" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex justify-between items-center">
                    <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>Total</span>
                    <span className="text-2xl font-light" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
                      ₹{total.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="flex justify-between items-center mt-2 text-sm"
                    style={{ color: '#16a34a' }}>
                    <span>Advance (30%)</span>
                    <span className="font-semibold">₹{advance.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between items-center mt-1 text-sm"
                    style={{ color: 'var(--muted)' }}>
                    <span>Balance on event day</span>
                    <span>₹{(total - advance).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Proposals */}
            <div className="rounded-2xl overflow-hidden"
              style={{ background: 'white', border: '1px solid var(--border)' }}>
              <div className="px-4 py-3 border-b flex items-center gap-2"
                style={{ borderColor: 'var(--border)' }}>
                <FileText size={14} style={{ color: 'var(--gold)' }} />
                <span className="font-medium text-sm" style={{ color: 'var(--charcoal)' }}>Recent Proposals</span>
              </div>
              {isLoadingProposals ? (
                <div className="flex justify-center py-6">
                  <RefreshCw size={18} className="animate-spin" style={{ color: 'var(--gold)' }} />
                </div>
              ) : recentProposals.length === 0 ? (
                <div className="py-6 text-center text-sm" style={{ color: 'var(--muted)' }}>No proposals yet</div>
              ) : (
                <div className="divide-y" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {recentProposals.map(p => {
                    const sc = STATUS_COLORS[p.status] || STATUS_COLORS.draft
                    return (
                      <div key={p.id} className="px-4 py-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium text-sm" style={{ color: 'var(--charcoal)' }}>{p.client_name}</p>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{p.proposal_number} · {p.package_name}</p>
                          </div>
                          <span className="text-xs px-2 py-0.5 rounded-full"
                            style={{ background: sc.bg, color: sc.color }}>
                            {p.status}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-sm font-medium" style={{ color: 'var(--gold-dark)' }}>
                            ₹{p.total_price?.toLocaleString('en-IN')}
                          </span>
                          <div className="flex gap-1 flex-wrap">
                            <a href={`/api/proposals/${p.id}/preview`} target="_blank" rel="noopener noreferrer"
                              className="text-xs px-2 py-1 rounded-lg flex items-center gap-1"
                              style={{ border: '1px solid var(--border)', color: 'var(--slate)', background: 'var(--cream)' }}>
                              <Eye size={10} /> View
                            </a>
                            <a href={`/api/proposals/${p.id}/pdf`} target="_blank" rel="noopener noreferrer"
                              className="text-xs px-2 py-1 rounded-lg flex items-center gap-1 text-white"
                              style={{ background: 'var(--gold-dark, #a07a28)' }}>
                              <Download size={10} /> PDF
                            </a>
                            {(p.client_phone || p.share_token) && (
                              <button
                                onClick={() => {
                                  // Use client_phone from proposal, fall back to lead's phone
                                  const clientPhone = ((p.client_phone || p.leads?.phone || ''))
                                    .replace(/\D/g, '').replace(/^91/, '')
                                  if (!clientPhone) return
                                  const appUrl = window.location.origin
                                  const shareUrl = p.share_token
                                    ? `${appUrl}/proposal/share/${p.share_token}`
                                    : `${appUrl}/api/proposals/${p.id}/preview`
                                  const eventDate = p.event_date
                                    ? new Date(p.event_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
                                    : ''
                                  const message = [
                                    `Hello ${p.client_name || p.leads?.name || ''},`,
                                    '',
                                    'Thank you for choosing BookMySpaces 🌟',
                                    'Please find your event proposal below:',
                                    '',
                                    `📄 Proposal: *${p.proposal_number}*`,
                                    p.event_type ? `🎉 Event: ${p.event_type}` : '',
                                    eventDate ? `📅 Date: ${eventDate}` : '',
                                    p.total_price ? `💰 Total: *₹${p.total_price.toLocaleString('en-IN')}*` : '',
                                    '',
                                    `🔗 View Proposal: ${shareUrl}`,
                                    '',
                                    'Please reply *CONFIRM* to proceed with booking.',
                                    '',
                                    'Warm regards, BookMySpaces',
                                    '📞 9051459463',
                                  ].filter(Boolean).join('\n')
                                  fetch('/api/proposals', {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ id: p.id, action: 'whatsapp_sent' }),
                                  }).catch(() => {})
                                  window.open(`https://wa.me/91${clientPhone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
                                }}
                                className="text-xs px-2 py-1 rounded-lg flex items-center gap-1 text-white"
                                style={{ background: '#25D366' }}>
                                <Send size={10} /> WA
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  draft:    { color: '#6b7280', bg: '#f3f4f6' },
  sent:     { color: '#2563eb', bg: '#eff6ff' },
  viewed:   { color: '#7c3aed', bg: '#f5f3ff' },
  accepted: { color: '#16a34a', bg: '#f0fdf4' },
  rejected: { color: '#dc2626', bg: '#fef2f2' },
  expired:  { color: '#9ca3af', bg: '#f9fafb' },
}

function PricingRow({ label, amount, muted, green }: { label: string; amount: number; muted?: boolean; green?: boolean }) {
  if (!amount && amount !== 0) return null
  return (
    <div className="flex justify-between items-center text-sm">
      <span style={{ color: green ? '#16a34a' : muted ? 'var(--muted)' : 'var(--slate)' }}>{label}</span>
      <span style={{ color: green ? '#16a34a' : 'var(--charcoal)' }}>
        {amount < 0 ? '- ' : ''}₹{Math.abs(amount).toLocaleString('en-IN')}
      </span>
    </div>
  )
}

function FormCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-6" style={{ background: 'white', border: '1px solid var(--border)' }}>
      <h3 className="text-xs uppercase tracking-wider mb-4" style={{ color: 'var(--muted)' }}>{title}</h3>
      {children}
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <div>
      <label className="text-xs mb-1.5 block" style={{ color: 'var(--muted)' }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
        style={{ border: '1px solid var(--border)', fontFamily: 'var(--font-body)', color: 'var(--charcoal)', background: 'white' }} />
    </div>
  )
}

export default function ProposalsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><RefreshCw className="animate-spin" size={24} /></div>}>
      <ProposalBuilderInner />
    </Suspense>
  )
}
