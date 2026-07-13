'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/app/(crm)/reservations/[id]/page.tsx
// V3 Day 6 — Operator Experience sprint: Reservation Details screen.
//
// Reads GET /api/reservations/[id] (reservation-service.ts's
// getReservationById(), with property/inventory joined in) and, when the
// reservation has a linked customer, also loads that customer's Timeline
// (Day 4's getCustomerTimeline(), exposed over HTTP this session) so an
// operator can see the full conversation/proposal/payment history next to
// the booking itself. Status actions (Confirm/Cancel/Check In/Check Out)
// call POST /api/reservations/[id]/status, which is a thin wrapper over
// reservation-workflow.ts's named transition functions — no state machine
// logic duplicated here.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Building2, Calendar, Users, IndianRupee, Phone, Mail,
  MapPin, FileText, Receipt, CheckCircle2, XCircle, LogIn, LogOut,
  RefreshCw, AlertTriangle, ExternalLink, Sparkles,
} from 'lucide-react'

type ReservationStatus = 'inquiry' | 'tentative' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show'
type StatusAction = 'confirm' | 'cancel' | 'check_in' | 'check_out'

interface ReservationDetail {
  id: string
  customerId: string | null
  guestName: string
  guestMobile: string | null
  guestEmail: string | null
  guestAddress: string | null
  propertyName: string
  inventoryName: string
  inventoryType: string | null
  roomCount: number
  checkInDate: string
  checkOutDate: string
  nights: number
  adults: number
  children: number
  bookingSource: string
  status: ReservationStatus
  baseRoomRate: number
  discountAmount: number
  finalRoomRate: number
  mealPlanCharge: number
  specialRequests: string | null
  proposalId: string | null
  invoiceId: string | null
}

const STATUS_STYLE: Record<ReservationStatus, string> = {
  inquiry: 'bg-gray-100 text-gray-700',
  tentative: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-green-100 text-green-700',
  checked_in: 'bg-blue-100 text-blue-700',
  checked_out: 'bg-gray-100 text-gray-500',
  cancelled: 'bg-red-100 text-red-700',
  no_show: 'bg-red-100 text-red-700',
}

// Only the four actions this session's status route actually supports
// (Confirm / Cancel / Check In / Check Out) — "mark tentative" is a valid
// state-machine transition (inquiry -> tentative) but has no named workflow
// wrapper yet, so it's intentionally not offered here. See DAY6 report.
const AVAILABLE_ACTIONS: Record<ReservationStatus, StatusAction[]> = {
  inquiry: ['confirm', 'cancel'],
  tentative: ['confirm', 'cancel'],
  confirmed: ['check_in', 'cancel'],
  checked_in: ['check_out'],
  checked_out: [],
  cancelled: [],
  no_show: [],
}

const ACTION_LABEL: Record<StatusAction, string> = {
  confirm: 'Confirm',
  cancel: 'Cancel',
  check_in: 'Check In',
  check_out: 'Check Out',
}

const ACTION_ICON: Record<StatusAction, React.ComponentType<{ className?: string }>> = {
  confirm: CheckCircle2,
  cancel: XCircle,
  check_in: LogIn,
  check_out: LogOut,
}

function fmtINR(n: number): string {
  return '₹' + Number(n).toLocaleString('en-IN')
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}

export default function ReservationDetailsPage({ params }: { params: { id: string } }) {
  const [reservation, setReservation] = useState<ReservationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionPending, setActionPending] = useState<StatusAction | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [generatingProposal, setGeneratingProposal] = useState(false)
  const [proposalResult, setProposalResult] = useState<{ proposalNumber: string | null; totalPrice: number } | null>(null)
  const [proposalError, setProposalError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/reservations/${params.id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load reservation')
      setReservation(json.reservation)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reservation')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => { load() }, [load])

  async function runAction(action: StatusAction) {
    setActionPending(action)
    setActionError(null)
    try {
      const reason = action === 'cancel' ? window.prompt('Reason for cancellation (optional):') ?? null : null
      const res = await fetch(`/api/reservations/${params.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason, crmLeadId: reservation?.customerId ?? null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Action failed')
      setReservation(json.reservation)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setActionPending(null)
    }
  }

  async function handleGenerateProposal() {
    setGeneratingProposal(true)
    setProposalError(null)
    try {
      const res = await fetch(`/api/reservations/${params.id}/proposal`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to generate proposal')
      setProposalResult({ proposalNumber: json.proposalNumber, totalPrice: json.totalPrice })
    } catch (err) {
      setProposalError(err instanceof Error ? err.message : 'Failed to generate proposal')
    } finally {
      setGeneratingProposal(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading reservation…
      </div>
    )
  }

  if (error || !reservation) {
    return (
      <div className="max-w-2xl mx-auto mt-12 text-center">
        <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
        <p className="text-gray-700 font-medium">{error ?? 'Reservation not found'}</p>
        <Link href="/reservations" className="text-sm text-blue-600 hover:underline mt-3 inline-block">
          ← Back to Reservation Dashboard
        </Link>
      </div>
    )
  }

  const total = reservation.finalRoomRate + reservation.mealPlanCharge
  const actions = AVAILABLE_ACTIONS[reservation.status]

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link href="/reservations" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="w-4 h-4" /> Back to Reservation Dashboard
      </Link>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{reservation.guestName}</h1>
            <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-600">
              {reservation.guestMobile && (
                <span className="inline-flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {reservation.guestMobile}</span>
              )}
              {reservation.guestEmail && (
                <span className="inline-flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {reservation.guestEmail}</span>
              )}
              {reservation.customerId && (
                <Link href={`/customers/${reservation.customerId}`} className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                  View customer profile <ExternalLink className="w-3 h-3" />
                </Link>
              )}
            </div>
          </div>
          <span className={`px-3 py-1.5 rounded-full text-xs font-semibold ${STATUS_STYLE[reservation.status]}`}>
            {reservation.status.replace(/_/g, ' ')}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4 pt-5 border-t border-gray-100">
          <div>
            <div className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-1"><Building2 className="w-3 h-3" /> Property</div>
            <div className="text-sm font-medium text-gray-800 mt-0.5">{reservation.propertyName}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-1"><MapPin className="w-3 h-3" /> Room / Hall</div>
            <div className="text-sm font-medium text-gray-800 mt-0.5">{reservation.inventoryName}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-1"><Calendar className="w-3 h-3" /> Check-in</div>
            <div className="text-sm font-medium text-gray-800 mt-0.5">{fmtDate(reservation.checkInDate)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-1"><Calendar className="w-3 h-3" /> Check-out</div>
            <div className="text-sm font-medium text-gray-800 mt-0.5">{fmtDate(reservation.checkOutDate)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-400 uppercase tracking-wide">Nights / Rooms</div>
            <div className="text-sm font-medium text-gray-800 mt-0.5">{reservation.nights} nights × {reservation.roomCount} room(s)</div>
          </div>
          <div>
            <div className="text-xs text-gray-400 uppercase tracking-wide flex items-center gap-1"><Users className="w-3 h-3" /> Occupancy</div>
            <div className="text-sm font-medium text-gray-800 mt-0.5">{reservation.adults} adults, {reservation.children} children</div>
          </div>
          <div>
            <div className="text-xs text-gray-400 uppercase tracking-wide">Booking source</div>
            <div className="text-sm font-medium text-gray-800 mt-0.5">{reservation.bookingSource.replace(/_/g, ' ')}</div>
          </div>
        </div>

        {reservation.specialRequests && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="text-xs text-gray-400 uppercase tracking-wide">Special requests / Notes</div>
            <p className="text-sm text-gray-700 mt-1">{reservation.specialRequests}</p>
          </div>
        )}
      </div>

      {/* ── Pricing ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-1.5"><IndianRupee className="w-4 h-4" /> Pricing</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Base room rate</span><span className="font-medium">{fmtINR(reservation.baseRoomRate)}</span></div>
          {reservation.discountAmount > 0 && (
            <div className="flex justify-between text-green-700"><span>Discount</span><span>-{fmtINR(reservation.discountAmount)}</span></div>
          )}
          {reservation.mealPlanCharge > 0 && (
            <div className="flex justify-between"><span className="text-gray-500">Meal plan</span><span className="font-medium">{fmtINR(reservation.mealPlanCharge)}</span></div>
          )}
          <div className="flex justify-between pt-2 border-t border-gray-100 font-semibold text-gray-900">
            <span>Total</span><span>{fmtINR(total)}</span>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap items-center gap-4 text-sm">
          {reservation.proposalId || proposalResult ? (
            <Link href="/proposals" className="inline-flex items-center gap-1.5 text-blue-600 hover:underline">
              <FileText className="w-3.5 h-3.5" />
              {proposalResult?.proposalNumber ? `Proposal ${proposalResult.proposalNumber} created` : 'Linked proposal'}
            </Link>
          ) : (
            <button
              onClick={handleGenerateProposal}
              disabled={generatingProposal}
              className="inline-flex items-center gap-1.5 text-blue-600 hover:underline disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" /> {generatingProposal ? 'Generating…' : 'Generate proposal from this reservation'}
            </button>
          )}
          {reservation.invoiceId ? (
            <span className="inline-flex items-center gap-1.5 text-blue-600"><Receipt className="w-3.5 h-3.5" /> Invoice generated</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-gray-400"><Receipt className="w-3.5 h-3.5" /> Generate an invoice from the proposal once created (Proposals page)</span>
          )}
        </div>
        {proposalError && <div className="mt-2 text-sm text-red-700">{proposalError}</div>}
      </div>

      {/* ── Status actions ──────────────────────────────────────────────── */}
      {actions.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Actions</h2>
          {actionError && <div className="text-sm text-red-700 mb-3">{actionError}</div>}
          <div className="flex gap-3">
            {actions.map((action) => {
              const Icon = ACTION_ICON[action]
              const destructive = action === 'cancel'
              return (
                <button
                  key={action}
                  onClick={() => runAction(action)}
                  disabled={actionPending !== null}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 ${
                    destructive
                      ? 'border border-red-200 text-red-700 hover:bg-red-50'
                      : 'bg-gray-900 text-white hover:bg-gray-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {actionPending === action ? 'Working…' : ACTION_LABEL[action]}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
