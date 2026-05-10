'use client'

import { useState, useEffect, useRef } from 'react'
import { MessageCircle, X, Send, Minimize2, Loader2 } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

const WELCOME_MESSAGE: Message = {
  role: 'assistant',
  content:
    "👋 Hello! Welcome to BookMySpaces. I'm Aria, your hospitality concierge. I'm here to help you plan the perfect event or stay! ✨\n\nAre you looking for:\n• 🎉 **Rooftop Event / Party** (30–70 guests)\n• 🍽️ **Private Dining**\n• 🏨 **Room Stay** (Near Airport or Mukundapur)\n• ☕ **Café Experience**\n\nJust tell me what you have in mind!",
  timestamp: new Date(),
}

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  // Initialize synchronously so sessionId is ready before first message
  const [sessionId, setSessionId] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem('bms_chat_session')
      if (stored && /^[0-9a-f-]{36}$/.test(stored)) return stored
    } catch {}
    return null
  })
  const [showNotification, setShowNotification] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Session initialized synchronously in useState above

  useEffect(() => {
    // Show notification bubble after 3 seconds
    const timer = setTimeout(() => {
      if (!isOpen) setShowNotification(true)
    }, 3000)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  useEffect(() => {
    if (isOpen && !isMinimized) {
      inputRef.current?.focus()
      setShowNotification(false)
    }
  }, [isOpen, isMinimized])

  const openChat = () => {
    setIsOpen(true)
    setIsMinimized(false)
    setShowNotification(false)
  }

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          sessionId,
        }),
      })

      const data = await response.json()

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply || 'Sorry, I had trouble responding. Please try again!',
          timestamp: new Date(),
        },
      ])

      // Always sync sessionId from server — server is authoritative
      if (data.sessionId) {
        setSessionId(data.sessionId)
        try { localStorage.setItem('bms_chat_session', data.sessionId) } catch {}
      }
    } catch {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content:
            "I'm having connectivity issues right now 😔 Please WhatsApp us directly at **9051459463** and we'll assist you immediately!",
          timestamp: new Date(),
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <>
      {/* Chat Window */}
      {isOpen && (
        <div
          className={`fixed bottom-24 right-5 w-[380px] max-w-[calc(100vw-20px)] rounded-2xl overflow-hidden shadow-2xl z-50 transition-all duration-300 ${
            isMinimized ? 'h-16' : 'h-[580px] max-h-[calc(100vh-120px)]'
          }`}
          style={{ border: '1px solid rgba(201,168,76,0.2)' }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 h-16 flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, #0f1923 0%, #1a2840 100%)',
              borderBottom: '1px solid rgba(201,168,76,0.2)',
            }}
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-base"
                  style={{ background: 'rgba(201,168,76,0.2)', border: '1px solid rgba(201,168,76,0.4)' }}
                >
                  ✨
                </div>
                <div
                  className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
                  style={{ background: '#22c55e', borderColor: '#0f1923' }}
                />
              </div>
              <div>
                <p className="text-white font-medium text-sm leading-none">Aria</p>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(201,168,76,0.8)' }}>
                  BookMySpaces Concierge · Online
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsMinimized(!isMinimized)}
                className="text-gray-400 hover:text-white transition-colors p-1"
              >
                <Minimize2 size={15} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-white transition-colors p-1"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* Messages */}
              <div
                className="flex-1 overflow-y-auto p-4 space-y-4"
                style={{
                  height: 'calc(100% - 130px)',
                  background: '#f8f6f2',
                }}
              >
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} bubble-animate`}
                  >
                    {msg.role === 'assistant' && (
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs flex-shrink-0 mr-2 mt-1"
                        style={{ background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.3)' }}
                      >
                        ✨
                      </div>
                    )}
                    <div
                      className={`max-w-[78%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'rounded-br-sm text-white'
                          : 'rounded-bl-sm'
                      }`}
                      style={{
                        background:
                          msg.role === 'user'
                            ? 'linear-gradient(135deg, #1a2840, #0f1923)'
                            : 'white',
                        color: msg.role === 'user' ? 'white' : '#1a1a1a',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                        whiteSpace: 'pre-line',
                      }}
                    >
                      {msg.content.split(/\*\*(.*?)\*\*/g).map((part, j) =>
                        j % 2 === 1 ? <strong key={j}>{part}</strong> : part
                      )}
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex justify-start bubble-animate">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs flex-shrink-0 mr-2 mt-1"
                      style={{ background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.3)' }}
                    >
                      ✨
                    </div>
                    <div
                      className="px-4 py-3 rounded-2xl rounded-bl-sm"
                      style={{ background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}
                    >
                      <div className="flex gap-1 items-center h-4">
                        <div
                          className="w-1.5 h-1.5 rounded-full typing-dot"
                          style={{ background: '#c9a84c' }}
                        />
                        <div
                          className="w-1.5 h-1.5 rounded-full typing-dot"
                          style={{ background: '#c9a84c' }}
                        />
                        <div
                          className="w-1.5 h-1.5 rounded-full typing-dot"
                          style={{ background: '#c9a84c' }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div
                className="p-3 flex gap-2 items-center"
                style={{
                  background: 'white',
                  borderTop: '1px solid #f0ede8',
                }}
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about venues, packages, availability..."
                  className="flex-1 text-sm outline-none"
                  style={{
                    fontFamily: 'var(--font-body)',
                    color: 'var(--charcoal)',
                    background: 'transparent',
                    padding: '8px 12px',
                    borderRadius: '20px',
                    border: '1px solid #e8e4de',
                  }}
                  disabled={isLoading}
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || isLoading}
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-all flex-shrink-0 disabled:opacity-40"
                  style={{
                    background: 'linear-gradient(135deg, #c9a84c, #a07a28)',
                  }}
                >
                  {isLoading ? (
                    <Loader2 size={15} className="text-white animate-spin" />
                  ) : (
                    <Send size={14} className="text-white" />
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Floating Button */}
      <div className="fixed bottom-5 right-5 z-50">
        {/* Notification bubble */}
        {showNotification && !isOpen && (
          <div
            className="absolute -top-14 right-0 px-4 py-2 rounded-xl text-sm text-white whitespace-nowrap bubble-animate shadow-lg"
            style={{
              background: 'linear-gradient(135deg, #0f1923, #1a2840)',
              border: '1px solid rgba(201,168,76,0.3)',
              fontFamily: 'var(--font-body)',
            }}
          >
            👋 Need help planning your event?
            <div
              className="absolute -bottom-1.5 right-5 w-3 h-3 rotate-45"
              style={{ background: '#1a2840' }}
            />
          </div>
        )}

        <button
          onClick={isOpen ? () => setIsOpen(false) : openChat}
          className="w-14 h-14 rounded-full flex items-center justify-center shadow-luxury-lg transition-all pulse-gold"
          style={{
            background: 'linear-gradient(135deg, #c9a84c 0%, #a07a28 100%)',
          }}
        >
          {isOpen ? (
            <X size={22} className="text-white" />
          ) : (
            <MessageCircle size={22} className="text-white" />
          )}
        </button>
      </div>
    </>
  )
}
