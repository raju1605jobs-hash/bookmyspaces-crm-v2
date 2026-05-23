// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/types/whatsapp.ts
// All TypeScript types for WhatsApp Cloud API integration.
// ─────────────────────────────────────────────────────────────────────────────

import { ConversationState, MessageDirection, MessageStatus, SourceChannel } from '@/constants/conversation-states'

// ─── WhatsApp Cloud API Webhook Payload Types ────────────────────────────────

export interface WAWebhookPayload {
  object: string
  entry: WAEntry[]
}

export interface WAEntry {
  id: string            // WhatsApp Business Account ID
  changes: WAChange[]
}

export interface WAChange {
  value: WAChangeValue
  field: string
}

export interface WAChangeValue {
  messaging_product: string
  metadata: WAMetadata
  contacts?: WAContact[]
  messages?: WAInboundMessage[]
  statuses?: WAStatusUpdate[]
}

export interface WAMetadata {
  display_phone_number: string
  phone_number_id: string
}

export interface WAContact {
  profile: { name: string }
  wa_id: string
}

export interface WAInboundMessage {
  from: string
  id: string             // wamid — used for dedup
  timestamp: string
  type: WAMessageType
  text?: { body: string }
  image?: WAMedia
  audio?: WAMedia
  video?: WAMedia
  document?: WAMedia & { filename?: string }
  location?: WALocation
  sticker?: WAMedia
  interactive?: WAInteractive
  context?: { from: string; id: string }
}

export type WAMessageType =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'location'
  | 'sticker'
  | 'interactive'
  | 'unknown'

export interface WAMedia {
  id: string
  mime_type: string
  sha256?: string
  caption?: string
}

export interface WALocation {
  latitude: number
  longitude: number
  name?: string
  address?: string
}

export interface WAInteractive {
  type: 'button_reply' | 'list_reply'
  button_reply?: { id: string; title: string }
  list_reply?: { id: string; title: string; description?: string }
}

export interface WAStatusUpdate {
  id: string             // wamid of the outbound message
  status: 'sent' | 'delivered' | 'read' | 'failed'
  timestamp: string
  recipient_id: string
  errors?: Array<{ code: number; title: string }>
}

// ─── Send Message Request Types ──────────────────────────────────────────────

export interface WASendTextRequest {
  messaging_product: 'whatsapp'
  recipient_type: 'individual'
  to: string
  type: 'text'
  text: { body: string; preview_url?: boolean }
}

export interface WASendTemplateRequest {
  messaging_product: 'whatsapp'
  recipient_type: 'individual'
  to: string
  type: 'template'
  template: {
    name: string
    language: { code: string }
    components?: WATemplateComponent[]
  }
}

export interface WATemplateComponent {
  type: 'header' | 'body' | 'button'
  parameters: WATemplateParameter[]
  sub_type?: string
  index?: number
}

export interface WATemplateParameter {
  type: 'text' | 'currency' | 'date_time' | 'image' | 'document' | 'video'
  text?: string
}

export interface WASendResponse {
  messaging_product: string
  contacts: Array<{ input: string; wa_id: string }>
  messages: Array<{ id: string }>
}

// ─── Internal CRM Types ──────────────────────────────────────────────────────

export interface WhatsAppConversation {
  id: string
  created_at: string
  updated_at: string
  phone: string
  lead_id: string | null
  source_channel: SourceChannel
  current_state: ConversationState
  collected_name: string | null
  collected_event_type: string | null
  collected_event_date: string | null
  collected_guest_count: string | null
  assigned_to: string | null
  last_message_at: string
  qualified_at: string | null
  handoff_at: string | null
}

export interface WhatsAppMessage {
  id: string
  created_at: string
  lead_id: string | null
  conversation_id: string | null
  phone: string
  source_channel: SourceChannel
  direction: MessageDirection
  message_type: WAMessageType
  message_text: string | null
  media_url: string | null
  template_name: string | null
  message_status: MessageStatus
  whatsapp_message_id: string | null
  conversation_state: ConversationState | null
  raw_payload: Record<string, unknown>
}

// ─── Service Layer Types ──────────────────────────────────────────────────────

export interface ProcessInboundResult {
  success: boolean
  leadId: string | null
  conversationId: string | null
  messageId: string | null
  responsesSent: number
  error?: string
}

export interface SendMessageResult {
  success: boolean
  waMessageId?: string
  error?: string
}

export interface AutoResponseContext {
  phone: string
  conversation: WhatsAppConversation
  inboundText: string | null
  leadId: string | null
  leadName: string | null
}
