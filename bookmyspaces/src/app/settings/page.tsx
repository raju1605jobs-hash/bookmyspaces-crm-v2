'use client'

import { useState, useEffect } from 'react'
import { Settings, Save, RefreshCw, CheckCircle, Bell, MessageSquare, Star, Clock } from 'lucide-react'
import { toast } from 'sonner'

interface NotifSettings {
  daily_summary_enabled: string
  daily_summary_time: string
  daily_summary_whatsapp: string
  vip_threshold_score: string
  vip_threshold_budget: string
  alert_new_lead_whatsapp: string
  festival_campaign_auto: string
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<NotifSettings>({
    daily_summary_enabled: 'true',
    daily_summary_time: '08:00',
    daily_summary_whatsapp: '9051459463',
    vip_threshold_score: '8',
    vip_threshold_budget: '50000',
    alert_new_lead_whatsapp: 'true',
    festival_campaign_auto: 'false',
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    fetch('/api/notifications')
      .then(r => r.json())
      .then(data => {
        if (data.settings) setSettings(prev => ({ ...prev, ...data.settings }))
      })
      .finally(() => setIsLoading(false))
  }, [])

  const save = async () => {
    setIsSaving(true)
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      })
      toast.success('Settings saved successfully')
    } catch {
      toast.error('Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }

  const set = (key: keyof NotifSettings, value: string) =>
    setSettings(prev => ({ ...prev, [key]: value }))

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="animate-spin" size={24} style={{ color: 'var(--gold)' }} />
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--cream)', fontFamily: 'var(--font-body)' }}>
      <nav className="sticky top-0 z-40 px-6 py-4 flex items-center justify-between"
        style={{ background: 'rgba(248,245,240,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)' }}>
        <div className="text-xl font-light" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
          BookMySpaces <span className="text-sm" style={{ color: 'var(--gold)' }}>Settings</span>
        </div>
        <div className="flex gap-2">
          <button onClick={save} disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #c9a84c, #a07a28)' }}>
            {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            Save Settings
          </button>
          <a href="/dashboard" className="text-sm px-4 py-2 rounded-lg"
            style={{ border: '1px solid var(--border)', background: 'white', color: 'var(--slate)' }}>
            ← CRM
          </a>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-10 space-y-6">
        <div>
          <h1 className="text-3xl font-light" style={{ fontFamily: 'var(--font-display)', color: 'var(--charcoal)' }}>
            System Settings
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            Configure automation, notifications, and AI thresholds
          </p>
        </div>

        {/* Daily Summary */}
        <SettingCard title="Daily AI Summary" icon={<Bell size={16} style={{ color: 'var(--gold)' }} />}>
          <Toggle label="Enable daily summary" value={settings.daily_summary_enabled === 'true'}
            onChange={v => set('daily_summary_enabled', v ? 'true' : 'false')} />
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'var(--muted)' }}>Send time (IST)</label>
              <input type="time" value={settings.daily_summary_time}
                onChange={e => set('daily_summary_time', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ border: '1px solid var(--border)', background: 'white' }} />
            </div>
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'var(--muted)' }}>Send to WhatsApp</label>
              <input type="text" value={settings.daily_summary_whatsapp}
                onChange={e => set('daily_summary_whatsapp', e.target.value)}
                placeholder="9051459463"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ border: '1px solid var(--border)', background: 'white', fontFamily: 'var(--font-body)' }} />
            </div>
          </div>
          <p className="text-xs mt-3" style={{ color: 'var(--muted)' }}>
            💡 Set up a cron job to call POST /api/ai-summary with action: "generate" at your preferred time.
            Use <a href="https://cron-job.org" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold)' }}>cron-job.org</a> (free) or n8n.
          </p>
        </SettingCard>

        {/* VIP Detection */}
        <SettingCard title="VIP any Detection" icon={<Star size={16} style={{ color: 'var(--gold)' }} />}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'var(--muted)' }}>Min AI Score for VIP</label>
              <select value={settings.vip_threshold_score}
                onChange={e => set('vip_threshold_score', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ border: '1px solid var(--border)', background: 'white' }}>
                {[6, 7, 8, 9].map(n => <option key={n} value={n}>Score {n}+/10</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs mb-1.5 block" style={{ color: 'var(--muted)' }}>Min Budget for VIP (₹)</label>
              <input type="number" value={settings.vip_threshold_budget}
                onChange={e => set('vip_threshold_budget', e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ border: '1px solid var(--border)', background: 'white', fontFamily: 'var(--font-body)' }} />
            </div>
          </div>
        </SettingCard>

        {/* New any Alerts */}
        <SettingCard title="New any Alerts" icon={<MessageSquare size={16} style={{ color: 'var(--gold)' }} />}>
          <Toggle label="WhatsApp alert on new website lead"
            value={settings.alert_new_lead_whatsapp === 'true'}
            onChange={v => set('alert_new_lead_whatsapp', v ? 'true' : 'false')} />
          <p className="text-xs mt-3" style={{ color: 'var(--muted)' }}>
            When a new lead is captured via the website chatbot, send an instant WhatsApp notification to the manager number above.
          </p>
        </SettingCard>

        {/* Festival Campaigns */}
        <SettingCard title="Festival Campaigns" icon={<Clock size={16} style={{ color: 'var(--gold)' }} />}>
          <Toggle label="Auto-generate festival campaigns (manual approval still required)"
            value={settings.festival_campaign_auto === 'true'}
            onChange={v => set('festival_campaign_auto', v ? 'true' : 'false')} />
          <p className="text-xs mt-3" style={{ color: 'var(--muted)' }}>
            When enabled, the system will draft a festival campaign message 7 days before each festival.
            You review and send manually from the Campaigns page.
          </p>
        </SettingCard>

        {/* n8n Cron Setup Guide */}
        <div className="rounded-2xl p-6"
          style={{ background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.2)' }}>
          <h3 className="font-medium mb-4 flex items-center gap-2" style={{ color: 'var(--charcoal)' }}>
            🔁 Automation Setup (n8n / Cron)
          </h3>
          <div className="space-y-3 text-sm" style={{ color: 'var(--slate)' }}>
            <div>
              <p className="font-medium mb-1">Daily Summary (8 AM IST)</p>
              <code className="block px-3 py-2 rounded text-xs"
                style={{ background: '#0f1923', color: '#c9a84c' }}>
                POST {typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.vercel.app'}/api/ai-summary{'\n'}
                Body: {`{"action":"generate","send_whatsapp":true}`}
              </code>
            </div>
            <div>
              <p className="font-medium mb-1">VIP Detection (Every 6 hours)</p>
              <code className="block px-3 py-2 rounded text-xs"
                style={{ background: '#0f1923', color: '#c9a84c' }}>
                POST .../api/ai-summary{'\n'}
                Body: {`{"action":"detect_vips"}`}
              </code>
            </div>
            <div>
              <p className="font-medium mb-1">Follow-up Automation (Every 4 hours)</p>
              <code className="block px-3 py-2 rounded text-xs"
                style={{ background: '#0f1923', color: '#c9a84c' }}>
                POST .../api/followups{'\n'}
                Body: {`{"action":"bulk"}`}
              </code>
            </div>
          </div>
        </div>

        <button onClick={save} disabled={isSaving}
          className="w-full py-3.5 rounded-xl text-white font-medium flex items-center justify-center gap-2 disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #c9a84c, #a07a28)' }}>
          {isSaving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
          Save All Settings
        </button>
      </div>
    </div>
  )
}

function SettingCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-6" style={{ background: 'white', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)' }}>
          {icon}
        </div>
        <h2 className="font-medium" style={{ color: 'var(--charcoal)' }}>{title}</h2>
      </div>
      {children}
    </div>
  )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <div className="relative">
        <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} className="sr-only" />
        <div className="w-10 h-6 rounded-full transition-colors"
          style={{ background: value ? 'var(--gold)' : '#d1d5db' }}>
          <div className="w-4 h-4 bg-white rounded-full shadow transition-transform mt-1"
            style={{ marginLeft: value ? '22px' : '2px', transition: 'margin-left 0.2s' }} />
        </div>
      </div>
      <span className="text-sm" style={{ color: 'var(--slate)' }}>{label}</span>
    </label>
  )
}
