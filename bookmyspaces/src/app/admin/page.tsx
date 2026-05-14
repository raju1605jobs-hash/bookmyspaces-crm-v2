'use client'

import { useState } from 'react'
import {
  Upload, CheckCircle, AlertCircle, Loader2,
  Database, Activity, FileText, RefreshCw,
} from 'lucide-react'

interface HealthStatus {
  status: string
  timestamp: string
  checks: Record<string, { status: string; message: string }>
}

export default function AdminPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [isCheckingHealth, setIsCheckingHealth] = useState(false)
  const [isSeeding, setIsSeeding] = useState(false)
  const [seedResult, setSeedResult] = useState<string | null>(null)
  const [seedProgress, setSeedProgress] = useState<string | null>(null)
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
    setSeedProgress('Seeding all knowledge sources...')

    try {
      const res = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'seed_all' }),
      })

      const data = await res.json()

      if (data.success) {
        setSeedResult(`✓ ${data.message}`)
        await fetchKnowledge()
      } else {
        setSeedResult(`✗ Failed: ${data.error}`)
      }
    } catch {
      setSeedResult('✗ Network error — try again')
    } finally {
      setIsSeeding(false)
      setSeedProgress(null)
    }
  }

  const addCustomText = async () => {
    if (!customText.trim() || !customSource.trim()) {
      setAddResult('✗ Please provide both text content and source name')
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
        setAddResult(`✓ ${data.message}`)
        setCustomText('')
        setCustomSource('')
        await fetchKnowledge()
      } else {
        setAddResult(`✗ Failed: ${data.error}`)
      }
    } catch {
      setAddResult('✗ Network error')
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
    <div className="min-h-screen bg-[#f8f5f0] px-6 py-8">
      <div className="max-w-5xl mx-auto space-y-8">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-light text-[#1f2937]">Admin Panel</h1>
            <p className="text-sm text-gray-500 mt-1">System health, AI knowledge, and CRM tools</p>
          </div>
          <a href="/dashboard" className="px-4 py-2 rounded-lg border bg-white text-sm">← CRM Dashboard</a>
        </div>

        {/* Health */}
        <div className="bg-white border rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Activity size={18} />
            <h2 className="font-medium">System Health</h2>
          </div>
          <button onClick={checkHealth} disabled={isCheckingHealth}
            className="px-4 py-2 rounded-lg bg-black text-white text-sm flex items-center gap-2">
            {isCheckingHealth ? <Loader2 size={15} className="animate-spin" /> : <Activity size={15} />}
            Run Health Check
          </button>
          {health && (
            <div className="space-y-2">
              <div className="text-xs font-medium px-1" style={{
                color: health.status === 'healthy' ? '#16a34a' : health.status === 'degraded' ? '#d97706' : '#dc2626'
              }}>
                Overall: {health.status.toUpperCase()}
              </div>
              {Object.entries(health.checks).map(([key, check]) => (
                <div key={key} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    {check.status === 'ok'
                      ? <CheckCircle size={14} className="text-green-600" />
                      : <AlertCircle size={14} className={check.status === 'warn' ? 'text-yellow-500' : 'text-red-600'} />}
                    <span>{key}</span>
                  </div>
                  <span className="text-gray-500 text-xs max-w-xs truncate">{check.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Knowledge Base */}
        <div className="bg-white border rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Database size={18} />
            <h2 className="font-medium">Knowledge Base</h2>
          </div>

          <div className="flex gap-3">
            <button onClick={seedKnowledge} disabled={isSeeding}
              className="px-4 py-2 rounded-lg bg-yellow-600 text-white text-sm flex items-center gap-2 disabled:opacity-60">
              {isSeeding ? <><Loader2 size={15} className="animate-spin" /> Seeding...</> : <><Database size={15} /> Seed Static Knowledge</>}
            </button>
            <button onClick={fetchKnowledge} className="px-4 py-2 rounded-lg border bg-white text-sm flex items-center gap-2">
              <RefreshCw size={15} /> View Knowledge
            </button>
          </div>

          {seedProgress && (
            <div className="text-sm text-yellow-700 bg-yellow-50 px-3 py-2 rounded-lg flex items-center gap-2">
              <Loader2 size={13} className="animate-spin" /> {seedProgress}
            </div>
          )}

          {seedResult && (
            <div className={`text-sm px-3 py-2 rounded-lg ${seedResult.startsWith('✓') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {seedResult}
            </div>
          )}

          {totalChunks !== null && (
            <div className="text-sm text-gray-500">{totalChunks} chunks indexed</div>
          )}

          {knowledgeDocs.length > 0 && (
            <div className="space-y-2">
              {knowledgeDocs.map((doc: any) => (
                <div key={doc.id} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <FileText size={14} />
                    <span>{doc.name}</span>
                  </div>
                  <span className="text-gray-500">{doc.chunk_count} chunks</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Custom Knowledge */}
        <div className="bg-white border rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Upload size={18} />
            <h2 className="font-medium">Add Custom Knowledge</h2>
          </div>
          <input type="text" value={customSource} onChange={e => setCustomSource(e.target.value)}
            placeholder="Source name (e.g. special_offers_2026)"
            className="w-full border rounded-lg px-3 py-2 text-sm" />
          <select value={customCategory} onChange={e => setCustomCategory(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm">
            <option value="general">General</option>
            <option value="faq">FAQ</option>
            <option value="packages">Packages</option>
            <option value="menu">Menu</option>
            <option value="policies">Policies</option>
          </select>
          <textarea value={customText} onChange={e => setCustomText(e.target.value)}
            rows={8} placeholder="Paste knowledge text here..."
            className="w-full border rounded-lg px-3 py-2 text-sm" />
          <button onClick={addCustomText} disabled={isAddingText}
            className="px-4 py-2 rounded-lg bg-black text-white text-sm flex items-center gap-2 disabled:opacity-60">
            {isAddingText ? <><Loader2 size={15} className="animate-spin" /> Processing...</> : <><Upload size={15} /> Add Knowledge</>}
          </button>
          {addResult && (
            <div className={`text-sm px-3 py-2 rounded-lg ${addResult.startsWith('✓') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {addResult}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
