'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  FileText, User, Phone, Mail, Calendar, Users,
  MapPin, Package, IndianRupee, MessageSquare,
  ArrowLeft, Plus, Trash2, Sparkles, ChevronRight,
  CheckCircle2, AlertCircle, Loader2,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Addon {
  name : string
  price: number
}

interface FormState {
  client_name          : string
  client_phone         : string
  client_email         : string
  event_type           : string
  event_date           : string
  event_time           : string
  guest_count          : string
  venue                : string
  package_name         : string
  base_price           : string
  addons               : Addon[]
  discount_amount      : string
  discount_reason      : string
  special_requirements : string
  lead_id              : string
}

// ── FIX 1: pre-select first option for all required selects ──────────────────
const EMPTY_FORM: FormState = {
  client_name          : '',
  client_phone         : '',
  client_email         : '',
  event_type           : 'Birthday Party',   // was '' — caused silent validation fail
  event_date           : '',
  event_time           : '',
  guest_count          : '',
  venue                : 'Rooftop Terrace',  // was '' — caused silent validation fail
  package_name         : 'Silver',           // was '' — caused silent validation fail
  base_price           : '',
  addons               : [],
  discount_amount      : '',
  discount_reason      : '',
  special_requirements : '',
  lead_id              : '',
}

const EVENT_TYPES = [
  'Birthday Party', 'Anniversary', 'Engagement',
  'Baby Shower', 'Corporate Event', 'Family Gathering',
  'Rooftop Dining', 'Product Launch', 'Other',
]

const VENUES = [
  'Rooftop Terrace', 'Celebration Hall', 'MonuRama Café',
  'Private Suite', 'Entire Property',
]

const PACKAGES = [
  'Silver', 'Gold', 'Platinum', 'Custom',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcTotal(base: string, addons: Addon[], discount: string): number {
  const b = parseFloat(base) || 0
  const a = addons.reduce((s, x) => s + (x.price || 0), 0)
  const d = parseFloat(discount) || 0
  return Math.max(0, b + a - d)
}

function formatINR(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(n)
}

// ─── Field components ─────────────────────────────────────────────────────────

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1.5">
      {children}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  )
}

function Input({
  value, onChange, placeholder, type = 'text', required, icon: Icon,
}: {
  value       : string
  onChange    : (v: string) => void
  placeholder?: string
  type?       : string
  required?   : boolean
  icon?       : React.ElementType
}) {
  return (
    <div className="relative">
      {Icon && (
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
      )}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className={`w-full border border-gray-200 rounded-lg py-2.5 text-sm text-gray-900 bg-white
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors
          placeholder:text-gray-400
          ${Icon ? 'pl-9 pr-3' : 'px-3'}`}
      />
    </div>
  )
}

function Select({
  value, onChange, options, placeholder, icon: Icon,
}: {
  value       : string
  onChange    : (v: string) => void
  options     : string[]
  placeholder?: string
  icon?       : React.ElementType
}) {
  return (
    <div className="relative">
      {Icon && (
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
      )}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`w-full border border-gray-200 rounded-lg py-2.5 text-sm text-gray-900 bg-white
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors
          appearance-none
          ${Icon ? 'pl-9 pr-8' : 'px-3 pr-8'}`}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 rotate-90 pointer-events-none" />
    </div>
  )
}

function Section({ title, icon: Icon, children }: {
  title    : string
  icon     : React.ElementType
  children : React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-100 bg-gray-50/60">
        <div className="p-1.5 bg-blue-100 rounded-lg">
          <Icon className="w-3.5 h-3.5 text-blue-600" />
        </div>
        <h2 className="text-sm font-bold text-gray-800">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

// ─── Inner page ───────────────────────────────────────────────────────────────

function NewProposalInner() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const [form, setForm] = useState<FormState>(() => ({
    ...EMPTY_FORM,
    lead_id     : searchParams.get('lead_id') ?? '',
    client_name : searchParams.get('name')    ?? '',
    client_phone: searchParams.get('phone')   ?? '',
    event_type  : searchParams.get('event')   || 'Birthday Party',
    guest_count : searchParams.get('guests')  ?? '',
    event_date  : searchParams.get('date')    ?? '',
  }))

  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const total   = calcTotal(form.base_price, form.addons, form.discount_amount)
  const advance = Math.round(total * 0.3)

  function set(field: keyof FormState) {
    return (value: string) => setForm(prev => ({ ...prev, [field]: value }))
  }

  function addAddon() {
    setForm(prev => ({ ...prev, addons: [...prev.addons, { name: '', price: 0 }] }))
  }

  function updateAddon(i: number, field: keyof Addon, value: string) {
    setForm(prev => {
      const addons = [...prev.addons]
      addons[i] = {
        ...addons[i],
        [field]: field === 'price' ? (parseFloat(value) || 0) : value,
      }
      return { ...prev, addons }
    })
  }

  function removeAddon(i: number) {
    setForm(prev => ({ ...prev, addons: prev.addons.filter((_, idx) => idx !== i) }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // ── FIX 2: scroll to top so error banner is visible under sticky header
    window.scrollTo({ top: 0, behavior: 'smooth' })

    if (!form.client_name.trim())  { setError('Client name is required.');  return }
    if (!form.client_phone.trim()) { setError('Client phone is required.'); return }
    if (!form.event_type)          { setError('Event type is required.');   return }
    if (!form.venue)               { setError('Venue is required.');        return }
    if (!form.package_name)        { setError('Package is required.');      return }
    if (!form.base_price || parseFloat(form.base_price) <= 0) {
      setError('Base price must be greater than 0.')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/proposals', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({
          lead_id              : form.lead_id || null,
          client_name          : form.client_name.trim(),
          client_phone         : form.client_phone.trim(),
          client_email         : form.client_email.trim() || null,
          event_type           : form.event_type,
          event_date           : form.event_date || null,
          event_time           : form.event_time || null,
          guest_count          : form.guest_count ? parseInt(form.guest_count) : null,
          venue                : form.venue,
          package_name         : form.package_name,
          base_price           : parseFloat(form.base_price),
          addons               : form.addons.filter(a => a.name.trim()),
          discount_amount      : parseFloat(form.discount_amount) || 0,
          discount_reason      : form.discount_reason.trim() || null,
          special_requirements : form.special_requirements.trim() || null,
          generate_cover_note  : true,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Server error ${res.status}`)
      }

      await res.json()
      setSuccess(true)
      setTimeout(() => router.push('/proposals'), 900)

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create proposal.')
      setSaving(false)
    }
  }

  // ─── Success screen ───────────────────────────────────────────────────────

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50/60 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">Proposal Created</h2>
          <p className="text-sm text-gray-500">Redirecting to proposals…</p>
        </div>
      </div>
    )
  }

  // ─── Form ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50/60">

      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-200 px-6 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-sm font-black text-gray-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                New Proposal
              </h1>
              {form.lead_id && (
                <p className="text-xs text-gray-400">Linked to lead · {form.lead_id.slice(0, 8)}…</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="proposal-form"
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {saving
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating…</>
                : <><Sparkles className="w-3.5 h-3.5" /> Create Proposal</>
              }
            </button>
          </div>
        </div>
      </header>

      {/* Form */}
      <form
        id="proposal-form"
        onSubmit={handleSubmit}
        className="max-w-3xl mx-auto px-6 py-6 space-y-4"
      >

        {/* Error banner */}
        {error && (
          <div className="flex items-start gap-2.5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* 1. Client */}
        <Section title="Client Information" icon={User}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <Label required>Full Name</Label>
              <Input
                value={form.client_name}
                onChange={set('client_name')}
                placeholder="Priya Sharma"
                icon={User}
                required
              />
            </div>
            <div>
              <Label required>Phone</Label>
              <Input
                value={form.client_phone}
                onChange={set('client_phone')}
                placeholder="9XXXXXXXXX"
                type="tel"
                icon={Phone}
                required
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                value={form.client_email}
                onChange={set('client_email')}
                placeholder="client@email.com"
                type="email"
                icon={Mail}
              />
            </div>
          </div>
        </Section>

        {/* 2. Event */}
        <Section title="Event Details" icon={Calendar}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label required>Event Type</Label>
              <Select
                value={form.event_type}
                onChange={set('event_type')}
                options={EVENT_TYPES}
                icon={Calendar}
              />
            </div>
            <div>
              <Label>Event Date</Label>
              <Input
                value={form.event_date}
                onChange={set('event_date')}
                type="date"
                icon={Calendar}
              />
            </div>
            <div>
              <Label>Event Time</Label>
              <Input
                value={form.event_time}
                onChange={set('event_time')}
                type="time"
                icon={Calendar}
              />
            </div>
            <div>
              <Label>Guest Count</Label>
              <Input
                value={form.guest_count}
                onChange={set('guest_count')}
                placeholder="40"
                type="number"
                icon={Users}
              />
            </div>
          </div>
        </Section>

        {/* 3. Venue & Package */}
        <Section title="Venue & Package" icon={MapPin}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label required>Venue</Label>
              <Select
                value={form.venue}
                onChange={set('venue')}
                options={VENUES}
                icon={MapPin}
              />
            </div>
            <div>
              <Label required>Package</Label>
              <Select
                value={form.package_name}
                onChange={set('package_name')}
                options={PACKAGES}
                icon={Package}
              />
            </div>
          </div>
        </Section>

        {/* 4. Pricing */}
        <Section title="Pricing" icon={IndianRupee}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <Label required>Base Price (₹)</Label>
              <Input
                value={form.base_price}
                onChange={set('base_price')}
                placeholder="15000"
                type="number"
                icon={IndianRupee}
                required
              />
            </div>
            <div>
              <Label>Discount (₹)</Label>
              <Input
                value={form.discount_amount}
                onChange={set('discount_amount')}
                placeholder="0"
                type="number"
                icon={IndianRupee}
              />
            </div>
            {parseFloat(form.discount_amount) > 0 && (
              <div className="sm:col-span-2">
                <Label>Discount Reason</Label>
                <Input
                  value={form.discount_reason}
                  onChange={set('discount_reason')}
                  placeholder="Loyalty discount, early booking, etc."
                />
              </div>
            )}
          </div>

          {/* Add-ons */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Add-ons</Label>
              <button
                type="button"
                onClick={addAddon}
                className="flex items-center gap-1 text-xs text-blue-600 font-semibold hover:text-blue-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add item
              </button>
            </div>

            {form.addons.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">No add-ons. Click "Add item" to include extras.</p>
            ) : (
              <div className="space-y-2">
                {form.addons.map((addon, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={addon.name}
                      onChange={e => updateAddon(i, 'name', e.target.value)}
                      placeholder="Add-on name (e.g. Cake)"
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                    <div className="relative w-32">
                      <IndianRupee className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                      <input
                        type="number"
                        value={addon.price || ''}
                        onChange={e => updateAddon(i, 'price', e.target.value)}
                        placeholder="0"
                        className="w-full border border-gray-200 rounded-lg pl-7 pr-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAddon(i)}
                      className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live total */}
          {parseFloat(form.base_price) > 0 && (
            <div className="mt-4 bg-gray-900 rounded-xl px-5 py-4">
              <div className="flex items-center justify-between text-sm">
                <div className="space-y-1.5 text-gray-400 text-xs">
                  <div className="flex justify-between gap-12">
                    <span>Base price</span>
                    <span className="text-gray-200">{formatINR(parseFloat(form.base_price) || 0)}</span>
                  </div>
                  {form.addons.length > 0 && (
                    <div className="flex justify-between gap-12">
                      <span>Add-ons</span>
                      <span className="text-gray-200">
                        {formatINR(form.addons.reduce((s, a) => s + (a.price || 0), 0))}
                      </span>
                    </div>
                  )}
                  {parseFloat(form.discount_amount) > 0 && (
                    <div className="flex justify-between gap-12">
                      <span>Discount</span>
                      <span className="text-red-400">−{formatINR(parseFloat(form.discount_amount))}</span>
                    </div>
                  )}
                </div>
                <div className="text-right ml-8">
                  <p className="text-xs text-gray-500 mb-0.5">Total</p>
                  <p className="text-xl font-black text-white">{formatINR(total)}</p>
                  <p className="text-xs text-amber-400 mt-0.5">Advance: {formatINR(advance)}</p>
                </div>
              </div>
            </div>
          )}
        </Section>

        {/* 5. Notes */}
        <Section title="Special Requirements" icon={MessageSquare}>
          <div>
            <Label>Notes for the proposal</Label>
            <textarea
              value={form.special_requirements}
              onChange={e => setForm(prev => ({ ...prev, special_requirements: e.target.value }))}
              placeholder="Dietary requirements, décor preferences, specific setup requests…"
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors
                placeholder:text-gray-400 resize-none"
            />
          </div>
        </Section>

        {/* AI note */}
        <div className="flex items-start gap-2.5 px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl">
          <Sparkles className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-700 leading-relaxed">
            An AI-written cover note will be generated automatically and included in the proposal PDF.
          </p>
        </div>

        {/* Bottom save button */}
        <div className="flex justify-end gap-3 pt-2 pb-8">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-60 transition-colors shadow-sm"
          >
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating proposal…</>
              : <><Sparkles className="w-4 h-4" /> Create Proposal</>
            }
          </button>
        </div>

      </form>
    </div>
  )
}

// ─── Page export ──────────────────────────────────────────────────────────────

export default function NewProposalPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50/60 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    }>
      <NewProposalInner />
    </Suspense>
  )
}
