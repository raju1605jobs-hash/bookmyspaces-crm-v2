import { logger } from './logger'
// ═══════════════════════════════════════════════════════════
// VOICE NOTE TRANSCRIPTION
// Uses OpenAI Whisper for audio → text
// ═══════════════════════════════════════════════════════════

import OpenAI from 'openai'

let _openai: OpenAI | null = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' })
  return _openai
}

// ─────────────────────────────────────────
// TRANSCRIBE AUDIO FROM URL
// Wati provides a media URL for voice notes
// ─────────────────────────────────────────
export async function transcribeVoiceNote(audioUrl: string): Promise<string | null> {
  try {
    // Download audio file
    const audioResponse = await fetch(audioUrl, {
      headers: {
        // Wati requires auth to fetch media
        Authorization: `Bearer ${process.env.WATI_API_TOKEN || ''}`,
      },
    })

    if (!audioResponse.ok) {
      logger.error('transcription', 'Failed to download audio', new Error(String(audioResponse.status)))
      return null
    }

    const audioBuffer = await audioResponse.arrayBuffer()
    const audioBlob = new Blob([audioBuffer], { type: 'audio/ogg' })

    // Create a File object for OpenAI
    const audioFile = new File([audioBlob], 'voice_note.ogg', { type: 'audio/ogg' })

    const transcription = await getOpenAI().audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'hi', // Hindi + English mixed is common in Kolkata
      response_format: 'text',
    })

    return transcription || null
  } catch (err) {
    logger.error('transcription', 'Voice transcription error', err)
    return null
  }
}

// ─────────────────────────────────────────
// TRANSCRIBE FROM BUFFER (direct bytes)
// ─────────────────────────────────────────
export async function transcribeAudioBuffer(
  buffer: Buffer,
  mimeType = 'audio/ogg'
): Promise<string | null> {
  try {
    const audioFile = new File([buffer as BlobPart], 'voice_note.ogg', { type: mimeType })

    const transcription = await getOpenAI().audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'hi',
      response_format: 'text',
    })

    return transcription || null
  } catch (err) {
    logger.error('transcription', 'Buffer transcription error', err)
    return null
  }
}
