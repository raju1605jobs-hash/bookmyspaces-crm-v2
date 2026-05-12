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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'seed_static',
        }),
      })

      const data = await res.json()

      if (data.success) {
        setSeedResult(`✅ ${data.message}`)
      } else {
        setSeedResult(`❌ Failed: ${data.error}`)
      }
    } catch {
      setSeedResult('❌ Network error')
    } finally {
      setIsSeeding(false)
    }
  }

  const addCustomText = async () => {
    if (!customText.trim() || !customSource.trim()) {
      setAddResult('❌ Please provide both text content and source')
      return
    }

    setIsAddingText(true)
    setAddResult(null)

    try {
      const res = await fetch('/api/knowledge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
    <div className="min-h-screen bg-[#f8f5f0] px-6 py-8">
      <div className="max-w-5xl mx-auto space-y-8">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-light text-[#1f2937]">
              Admin Panel
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              System health, AI knowledge, and CRM tools
            </p>
          </div>

          <a
            href="/dashboard"
            className="px-4 py-2 rounded-lg border bg-white text-sm"
          >
            ← CRM Dashboard
          </a>
        </div>

        <div className="bg-white border rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Activity size={18} />
            <h2 className="font-medium">System Health</h2>
          </div>

          <button
            onClick={checkHealth}
            disabled={isCheckingHealth}
            className="px-4 py-2 rounded-lg bg-black text-white text-sm flex items-center gap-2"
          >
            {isCheckingHealth ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Activity size={15} />
            )}

            Run Health Check
          </button>

          {health && (
            <div className="space-y-2">
              {Object.entries(health.checks).map(([key, check]) => (
                <div
                  key={key}
                  className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    {check.status === 'ok' ? (
                      <CheckCircle size={14} className="text-green-600" />
                    ) : (
                      <AlertCircle size={14} className="text-red-600" />
                    )}

                    <span>{key}</span>
                  </div>

                  <span className="text-gray-500">
                    {check.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Database size={18} />
            <h2 className="font-medium">
              Knowledge Base
            </h2>
          </div>

          <div className="flex gap-3">
            <button
              onClick={seedKnowledge}
              disabled={isSeeding}
              className="px-4 py-2 rounded-lg bg-yellow-600 text-white text-sm flex items-center gap-2"
            >
              {isSeeding ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Seeding...
                </>
              ) : (
                <>
                  <Database size={15} />
                  Seed Static Knowledge
                </>
              )}
            </button>

            <button
              onClick={fetchKnowledge}
              className="px-4 py-2 rounded-lg border bg-white text-sm flex items-center gap-2"
            >
              <RefreshCw size={15} />
              View Knowledge
            </button>
          </div>

          {seedResult && (
            <div className="text-sm">
              {seedResult}
            </div>
          )}

          {totalChunks !== null && (
            <div className="text-sm text-gray-500">
              {totalChunks} chunks indexed
            </div>
          )}

          {knowledgeDocs.length > 0 && (
            <div className="space-y-2">
              {knowledgeDocs.map((doc: any) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <FileText size={14} />
                    <span>{doc.name}</span>
                  </div>

                  <span className="text-gray-500">
                    {doc.chunk_count} chunks
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Upload size={18} />
            <h2 className="font-medium">
              Add Custom Knowledge
            </h2>
          </div>

          <input
            type="text"
            value={customSource}
            onChange={e => setCustomSource(e.target.value)}
            placeholder="Source name"
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />

          <select
            value={customCategory}
            onChange={e => setCustomCategory(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          >
            <option value="general">General</option>
            <option value="faq">FAQ</option>
            <option value="packages">Packages</option>
            <option value="menu">Menu</option>
          </select>

          <textarea
            value={customText}
            onChange={e => setCustomText(e.target.value)}
            rows={8}
            placeholder="Paste knowledge text..."
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />

          <button
            onClick={addCustomText}
            disabled={isAddingText}
            className="px-4 py-2 rounded-lg bg-black text-white text-sm flex items-center gap-2"
          >
            {isAddingText ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Upload size={15} />
                Add Knowledge
              </>
            )}
          </button>

          {addResult && (
            <div className="text-sm">
              {addResult}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}