// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/lib/whatsapp/detect-source.ts
// Determines the source channel (WEBSITE | FACEBOOK | INSTAGRAM) from the
// WhatsApp Cloud API webhook payload.
//
// WhatsApp Cloud API uses one Business Account connected to multiple entry
// points.  The metadata.phone_number_id in the payload is always the same WABA
// phone.  Source differentiation comes from the *referral* field (when a user
// clicks a Click-to-WhatsApp ad / button on Facebook or Instagram) or from
// utm / referrer we inject via the website button URL.
//
// Strategy:
//  1. If message has referral.source_type === 'ad'
//        AND referral.source_url contains 'instagram' → INSTAGRAM
//        AND referral.source_url contains 'facebook' / 'fb' → FACEBOOK
//  2. If message has referral.headline (organic FB/IG page CTA) — same logic
//  3. Fallback: WEBSITE
// ─────────────────────────────────────────────────────────────────────────────

import { SourceChannel } from '@/constants/conversation-states'
import type { WAInboundMessage } from '@/types/whatsapp'

interface WAMessageWithReferral extends WAInboundMessage {
  referral?: {
    source_url?: string
    source_type?: string  // 'ad' | 'post' | 'unknown'
    source_id?: string
    headline?: string
    body?: string
    ctwa_clid?: string    // Click-to-WhatsApp click ID
  }
}

/**
 * Derive the source channel for an inbound WhatsApp message.
 * Falls back to WEBSITE if no referral data is present.
 */
export function detectSourceChannel(message: WAMessageWithReferral): SourceChannel {
  const referral = message.referral

  if (!referral) return SourceChannel.WEBSITE

  const url = (referral.source_url ?? '').toLowerCase()
  const headline = (referral.headline ?? '').toLowerCase()

  const mentionsInstagram = url.includes('instagram') || url.includes('instagr.am')
  const mentionsFacebook  = url.includes('facebook') || url.includes('fb.com') || url.includes('fb.me')

  if (mentionsInstagram || headline.includes('instagram')) return SourceChannel.INSTAGRAM
  if (mentionsFacebook  || headline.includes('facebook'))  return SourceChannel.FACEBOOK

  // ctwa_clid is present for all Click-to-WhatsApp ad flows;
  // without a platform indicator we can't distinguish — default to WEBSITE
  return SourceChannel.WEBSITE
}

/**
 * Map SourceChannel to the leads.source column value expected by existing schema.
 */
export function sourceChannelToLeadSource(channel: SourceChannel): string {
  switch (channel) {
    case SourceChannel.FACEBOOK:  return 'whatsapp_facebook'
    case SourceChannel.INSTAGRAM: return 'whatsapp_instagram'
    case SourceChannel.WEBSITE:
    default:                      return 'whatsapp_website'
  }
}
