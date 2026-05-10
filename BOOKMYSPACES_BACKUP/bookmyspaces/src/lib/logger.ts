// ═══════════════════════════════════════════════════════════
// STRUCTURED LOGGER
// Provides consistent logging with context for debugging
// production issues without exposing sensitive data.
// ═══════════════════════════════════════════════════════════

type LogLevel = 'info' | 'warn' | 'error' | 'debug'

interface LogEntry {
  level: LogLevel
  context: string
  message: string
  data?: Record<string, unknown>
  error?: string
}

function log(level: LogLevel, context: string, message: string, data?: Record<string, unknown>, err?: unknown) {
  const entry: LogEntry = { level, context, message }

  if (data) {
    // Redact sensitive fields before logging
    const safe: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(data)) {
      if (['phone', 'email', 'name'].includes(k) && typeof v === 'string' && v.length > 3) {
        safe[k] = v.slice(0, 3) + '***' // partial redaction
      } else {
        safe[k] = v
      }
    }
    entry.data = safe
  }

  if (err) {
    if (err instanceof Error) {
      entry.error = err.message
    } else if (err && typeof err === 'object') {
      // Supabase errors are plain objects: { code, message, details, hint }
      // JSON.stringify reveals the actual error instead of "[object Object]"
      entry.error = JSON.stringify(err)
    } else {
      entry.error = String(err)
    }
  }

  const prefix = `[BMS:${context}]`
  if (level === 'error') {
    console.error(prefix, message, entry.data || '', entry.error || '')
  } else if (level === 'warn') {
    console.warn(prefix, message, entry.data || '')
  } else {
    console.log(prefix, message, entry.data || '')
  }
}

export const logger = {
  info: (context: string, message: string, data?: Record<string, unknown>) =>
    log('info', context, message, data),
  warn: (context: string, message: string, data?: Record<string, unknown>) =>
    log('warn', context, message, data),
  error: (context: string, message: string, err?: unknown, data?: Record<string, unknown>) =>
    log('error', context, message, data, err),
  debug: (context: string, message: string, data?: Record<string, unknown>) => {
    if (process.env.NODE_ENV === 'development') {
      log('debug', context, message, data)
    }
  },
}
