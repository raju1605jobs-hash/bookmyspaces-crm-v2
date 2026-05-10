import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Client for browser (anon key)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Admin client for server-side API routes (service role — bypasses RLS)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

export type Database = {
  public: {
    Tables: {
      leads: {
        Row: Lead
        Insert: Omit<Lead, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Lead, 'id' | 'created_at'>>
      }
      conversations: {
        Row: Conversation
        Insert: Omit<Conversation, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Conversation, 'id' | 'created_at'>>
      }
      knowledge_chunks: {
        Row: KnowledgeChunk
        Insert: Omit<KnowledgeChunk, 'id' | 'created_at'>
        Update: Partial<Omit<KnowledgeChunk, 'id' | 'created_at'>>
      }
      documents: {
        Row: Document
        Insert: Omit<Document, 'id' | 'created_at'>
        Update: Partial<Omit<Document, 'id' | 'created_at'>>
      }
      activity_logs: {
        Row: ActivityLog
        Insert: Omit<ActivityLog, 'id' | 'created_at'>
        Update: never
      }
    }
  }
}

export interface Lead {
  id: string
  created_at: string
  updated_at: string
  name: string | null
  phone: string | null
  email: string | null
  event_type: string | null
  event_date: string | null
  guest_count: number | null
  budget: string | null
  special_requirements: string | null
  venue: string | null
  status: LeadStatus
  source: LeadSource
  assigned_to: string | null
  notes: string | null
  sheets_synced: boolean
  sheets_row_id: string | null
  followup_date: string | null
  proposal_sent_at: string | null
  last_contacted_at: string | null
  inquiry_summary: string | null
  tags: string[]
  lead_score: number
  whatsapp_opted_in: boolean
  // Phase 3+ fields
  ai_score?: number
  ai_score_reason?: string
  ai_scored_at?: string
  booking_probability?: number
  event_time?: string
  calendar_event_id?: string
  // Phase 4+ fields
  is_vip?: boolean
  vip_reason?: string | null
  lifetime_value?: number
  repeat_customer?: boolean

}

export type LeadStatus =
  | 'new_inquiry'
  | 'followup_pending'
  | 'proposal_sent'
  | 'negotiation'
  | 'confirmed'
  | 'rejected'
  | 'future_prospect'

export type LeadSource = 'website' | 'whatsapp' | 'instagram' | 'justdial' | 'referral' | 'other'

export interface Conversation {
  id: string
  created_at: string
  updated_at: string
  lead_id: string | null
  session_id: string
  channel: 'website' | 'whatsapp'
  messages: ChatMessage[]
  summary: string | null
  extracted_name: string | null
  extracted_phone: string | null
  extracted_email: string | null
  extracted_event_type: string | null
  extracted_event_date: string | null
  extracted_guest_count: string | null
  extracted_budget: string | null
  is_active: boolean
  is_escalated: boolean
  escalation_reason: string | null
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface KnowledgeChunk {
  id: string
  created_at: string
  source_file: string
  source_type: 'pdf' | 'docx' | 'txt' | 'image' | 'manual'
  category: 'packages' | 'faq' | 'menu' | 'policies' | 'branding' | 'scripts' | 'general'
  content: string
  chunk_index: number
  embedding: number[] | null
  metadata: Record<string, unknown>
}

export interface Document {
  id: string
  created_at: string
  name: string
  original_filename: string
  file_type: string
  file_size: number | null
  storage_path: string | null
  category: string | null
  description: string | null
  processed: boolean
  chunk_count: number
  error: string | null
  uploaded_by: string
}

export interface ActivityLog {
  id: string
  created_at: string
  lead_id: string | null
  action: string
  description: string | null
  performed_by: string
  metadata: Record<string, unknown>
}
