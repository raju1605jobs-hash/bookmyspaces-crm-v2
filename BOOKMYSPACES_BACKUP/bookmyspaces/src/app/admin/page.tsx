'use client'

import { useState } from 'react'
import {
  Brain,
  Upload,
  CheckCircle,
  AlertCircle,
  Loader2,
  Database,
  Activity,
  FileText,
  RefreshCw,
} from 'lucide-react'

interface HealthStatus {
  status: string
  timestamp: string
  checks: Record<string, { status: string; message: string }>
}

interface KnowledgeResult {
  source: string
  chunks: number
}

export default function AdminPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [isCheckingHealth, setIsCheckingHealth] = useState(false)
  const [isSeeding, setIsSeeding] = useState(false)
  const [seedResult, setSeedResult] = useState<string | null>(null)
  const [customText, setCustomText] = useState('')
  const [customSource, setCustomSource] = useState('')
  const [customCategory, setCustomCategory] = useState('general')
  const [isAddingText, setIsAddingText] = useState(false)
  const [addResult, setAddResult] = useState<string | null>(null)
  const [knowledgeDocs, setKnowledgeDocs] = useState<any[]>([])
  const [totalChunks, setTotalChunks] = useState<number | null>(null)

  const checkHealth = async () => {
    setIsCheckingHealth(true)
    try {
      const res = await fetch('/api/health')
      const data = await res.json()
      setHealth(data)
    } catch {
      setHealth(null)
    } finally {
      setIsCheckingHealth(false)
    }
  }

  const seedKnowledge = async () => {
    setIsSeeding(true)
    setSeedResult(null)
    try {
      const res = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'seed_static' }),
      })
      const data = await res.json()
      if (data.success) {
        setSeedResult(`✅ ${data.message}`)
      } else {
        setSeedResult(`❌ Failed: ${data.error}`)
      }
    } catch (err) {
      setSeedResult('❌ Network error — check console')
    } finally {
      setIsSeeding(false)
    }
  }

  const addCustomText = async () => {
    if (!customText.trim() || !customSource.trim()) {
      setAddResult('❌ Please provide both text content and a source name')
      return
    }
    setIsAddingText(true)
    setAddResult(null)
    try {
      const res = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_text',
          text: customText,
          source: customSource,
          category: customCategory,
          name: customSource,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setAddResult(`✅ ${data.message}`)
        setCustomText('')
        setCustomSource('')
      } else {
        setAddResult(`❌ Failed: ${data.error}`)
      }
    } catch {
      setAddResult('❌ Network error')
    } finally {
      setIsAddingText(false)
    }
  }

  const fetchKnowledge = async () => {
    const res = await fetch('/api/knowledge')
    const data = await res.json()
    setKnowledgeDocs(data.documents || [])
    setTotalChunks(data.total_chunks || 0)
  }

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
          BookMySpaces <span className="text-sm" style={{ color: 'var(--gold)' }}>Admin</span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/dashboard"
            className="text-sm px-4 py-2 rounded-lg"
            style={{ color: 'var(--slate)', border: '1px solid var(--border)', background: 'white' }}
          >
            ← CRM Dashboard
          </a>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        <div>
          <h1
            className="text-3xl font-light"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}
          >
            Admin Panel
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            System health, knowledge base management, and configuration
          </p>
        </div>

        {/* System Health */}
        <AdminCard
          title="System Health Check"
          icon={<Activity size={18} style={{ color: 'var(--gold)' }} />}
        >
          <button
            onClick={checkHealth}
            disabled={isCheckingHealth}
            className="px-5 py-2.5 rounded-lg text-white text-sm font-medium flex items-center gap-2 disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #0f1923, #1a2840)' }}
          >
            {isCheckingHealth ? <Loader2 size={15} className="animate-spin" /> : <Activity size={15} />}
            Run Health Check
          </button>

          {health && (
            <div className="mt-4 space-y-2">
              <div
                className={`text-sm font-medium px-3 py-2 rounded-lg ${
                  health.status === 'healthy'
                    ? 'bg-green-50 text-green-700'
                    : 'bg-amber-50 text-amber-700'
                }`}
              >
                System Status: {health.status.toUpperCase()}
              </div>

              {Object.entries(health.checks).map(([key, check]) => (
                <div
                  key={key}
                  className="flex items-center justify-between px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--cream)', border: '1px solid var(--border)' }}
                >
                  <div className="flex items-center gap-2">
                    {check.status === 'ok' ? (
                      <CheckCircle size={14} className="text-green-600" />
                    ) : check.status === 'warning' ? (
                      <AlertCircle size={14} className="text-amber-500" />
                    ) : (
                      <AlertCircle size={14} className="text-red-600" />
                    )}
                    <span
                      className="font-medium capitalize"
                      style={{ color: 'var(--charcoal)' }}
                    >
                      {key.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <span style={{ color: 'var(--muted)' }}>{check.message}</span>
                </div>
              ))}
            </div>
          )}
        </AdminCard>

        {/* Knowledge Base Seeding */}
        <AdminCard
          title="Knowledge Base — Seed Business Data"
          icon={<Brain size={18} style={{ color: 'var(--gold)' }} />}
        >
          <p className="text-sm mb-4" style={{ color: 'var(--slate)' }}>
            This will load all built-in business knowledge (packages, FAQs, venues, policies,
            dining info) into the vector database so the AI chatbot can answer accurately.
            <br />
            <strong>Run this once after setup, and again after updating any business info.</strong>
          </p>

          <div className="flex gap-3">
            <button
              onClick={seedKnowledge}
              disabled={isSeeding}
              className="px-5 py-2.5 rounded-lg text-white text-sm font-medium flex items-center gap-2 disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #c9a84c, #a07a28)' }}
            >
              {isSeeding ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Seeding... (this takes ~30 seconds)
                </>
              ) : (
                <>
                  <Database size={15} />
                  Seed Static Business Knowledge
                </>
              )}
            </button>

            <button
              onClick={fetchKnowledge}
              className="px-4 py-2.5 rounded-lg text-sm flex items-center gap-2"
              style={{ border: '1px solid var(--border)', color: 'var(--slate)', background: 'white' }}
            >
              <RefreshCw size={15} />
              View Knowledge
            </button>
          </div>

          {seedResult && (
            <div
              className={`mt-3 text-sm px-3 py-2 rounded-lg ${
                seedResult.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}
            >
              {seedResult}
            </div>
          )}

          {totalChunks !== null && (
            <div className="mt-4 text-sm" style={{ color: 'var(--muted)' }}>
              📊 {totalChunks} knowledge chunks indexed in vector database
            </div>
          )}

          {knowledgeDocs.length > 0 && (
            <div className="mt-4 space-y-2">
              {knowledgeDocs.map(doc => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--cream)', border: '1px solid var(--border)' }}
                >
                  <div className="flex items-center gap-2">
                    <FileText size={13} style={{ color: 'var(--gold)' }} />
                    <span style={{ color: 'var(--charcoal)' }}>{doc.name}</span>
                    {doc.processed && (
                      <CheckCircle size={13} className="text-green-600" />
                    )}
                  </div>
                  <span style={{ color: 'var(--muted)' }}>{doc.chunk_count} chunks</span>
                </div>
              ))}
            </div>
          )}
        </AdminCard>

        {/* Add Custom Knowledge */}
        <AdminCard
          title="Add Custom Knowledge"
          icon={<Upload size={18} style={{ color: 'var(--gold)' }} />}
        >
          <p className="text-sm mb-4" style={{ color: 'var(--slate)' }}>
            Add any text content to the AI knowledge base. Paste menus, policies, new packages,
            special offers, or any business info.
          </p>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs mb-1.5 block" style={{ color: 'var(--muted)' }}>
                  Source Name (unique identifier)
                </label>
                <input
                  type="text"
                  value={customSource}
                  onChange={e => setCustomSource(e.target.value)}
                  placeholder="e.g. diwali_special_2026"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ border: '1px solid var(--border)', fontFamily: 'var(--font-body)', color: 'var(--charcoal)' }}
                />
              </div>
              <div>
                <label className="text-xs mb-1.5 block" style={{ color: 'var(--muted)' }}>
                  Category
                </label>
                <select
                  value={customCategory}
                  onChange={e => setCustomCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ border: '1px solid var(--border)', fontFamily: 'var(--font-body)', color: 'var(--charcoal)', background: 'white' }}
                >
                  <option value="packages">Packages</option>
                  <option value="faq">FAQ</option>
                  <option value="menu">Menu</option>
                  <option value="policies">Policies</option>
                  <option value="branding">Branding</option>
                  <option value="scripts">Scripts</option>
                  <option value="general">General</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'var(--muted)' }}>
                Content Text
              </label>
              <textarea
                value={customText}
                onChange={e => setCustomText(e.target.value)}
                placeholder="Paste your text content here... menus, policies, new packages, etc."
                rows={8}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                style={{ border: '1px solid var(--border)', fontFamily: 'var(--font-body)', color: 'var(--charcoal)' }}
              />
            </div>

            <button
              onClick={addCustomText}
              disabled={isAddingText}
              className="px-5 py-2.5 rounded-lg text-white text-sm font-medium flex items-center gap-2 disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #0f1923, #1a2840)' }}
            >
              {isAddingText ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload size={15} />
                  Add to Knowledge Base
                </>
              )}
            </button>

            {addResult && (
              <div
                className={`text-sm px-3 py-2 rounded-lg ${
                  addResult.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}
              >
                {addResult}
              </div>
            )}
          </div>
        </AdminCard>

        {/* Quick Links */}
        <AdminCard
          title="Quick Links"
          icon={<Activity size={18} style={{ color: 'var(--gold)' }} />}
        >
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'CRM Dashboard', href: '/dashboard', desc: 'View all leads & inquiries' },
              { label: 'WhatsApp Business', href: 'https://wa.me/919051459463', desc: 'Open WhatsApp chat', external: true },
              { label: 'Google Sheets', href: `https://docs.google.com/spreadsheets/d/${process.env.NEXT_PUBLIC_SHEETS_ID || 'YOUR_SHEET_ID'}`, desc: 'View synced leads', external: true },
              { label: 'Health Check API', href: '/api/health', desc: 'Raw health status JSON', external: true },
            ].map(link => (
              <a
                key={link.label}
                href={link.href}
                target={link.external ? '_blank' : undefined}
                rel={link.external ? 'noopener noreferrer' : undefined}
                className="block p-4 rounded-xl card-hover"
                style={{ border: '1px solid var(--border)', background: 'white' }}
              >
                <div className="font-medium text-sm mb-1" style={{ color: 'var(--charcoal)' }}>
                  {link.label} {link.external && '↗'}
                </div>
                <div className="text-xs" style={{ color: 'var(--muted)' }}>
                  {link.desc}
                </div>
              </a>
            ))}
          </div>
        </AdminCard>
      </div>
    </div>
  )
}

function AdminCard({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div
      className="rounded-2xl p-6"
      style={{ background: 'white', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-3 mb-5">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)' }}
        >
          {icon}
        </div>
        <h2 className="font-medium" style={{ color: 'var(--charcoal)' }}>
          {title}
        </h2>
      </div>
      {children}
    </div>
  )
}
