-- ═══════════════════════════════════════════════════════════
-- BOOKMYSPACES AI CRM — DATABASE SCHEMA
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ─────────────────────────────────────────
-- LEADS / CRM TABLE
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Contact Info
  name TEXT,
  phone TEXT,
  email TEXT,

  -- Inquiry Details
  event_type TEXT,
  event_date DATE,
  guest_count INTEGER,
  budget TEXT,
  special_requirements TEXT,
  venue TEXT, -- 'skyline' | 'monurama' | 'bookmyspaces'

  -- CRM Pipeline
  status TEXT DEFAULT 'new_inquiry'
    CHECK (status IN (
      'new_inquiry',
      'followup_pending',
      'proposal_sent',
      'negotiation',
      'confirmed',
      'rejected',
      'future_prospect'
    )),

  -- Source
  source TEXT DEFAULT 'website' 
    CHECK (source IN ('website', 'whatsapp', 'instagram', 'justdial', 'referral', 'other')),

  -- Staff
  assigned_to TEXT,
  notes TEXT,
  
  -- Google Sheets sync
  sheets_synced BOOLEAN DEFAULT FALSE,
  sheets_row_id TEXT,

  -- Follow-up
  followup_date TIMESTAMPTZ,
  proposal_sent_at TIMESTAMPTZ,
  last_contacted_at TIMESTAMPTZ,

  -- AI summary of conversation
  inquiry_summary TEXT,

  -- Tags (array of strings)
  tags TEXT[] DEFAULT '{}',

  -- Score (AI-generated lead score 1-10)
  lead_score INTEGER DEFAULT 5
);

-- ─────────────────────────────────────────
-- CONVERSATIONS TABLE
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  session_id TEXT NOT NULL UNIQUE,
  channel TEXT DEFAULT 'website' CHECK (channel IN ('website', 'whatsapp')),

  -- Serialized JSON array of {role, content, timestamp}
  messages JSONB DEFAULT '[]',

  -- AI-generated summary after conversation
  summary TEXT,

  -- Lead data extracted by AI
  extracted_name TEXT,
  extracted_phone TEXT,
  extracted_email TEXT,
  extracted_event_type TEXT,
  extracted_event_date TEXT,
  extracted_guest_count TEXT,
  extracted_budget TEXT,

  is_active BOOLEAN DEFAULT TRUE,
  is_escalated BOOLEAN DEFAULT FALSE,
  escalation_reason TEXT
);

-- ─────────────────────────────────────────
-- KNOWLEDGE BASE TABLE (RAG)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Source document info
  source_file TEXT NOT NULL,
  source_type TEXT CHECK (source_type IN ('pdf', 'docx', 'txt', 'image', 'manual')),
  category TEXT CHECK (category IN ('packages', 'faq', 'menu', 'policies', 'branding', 'scripts', 'general')),

  -- Content
  content TEXT NOT NULL,
  chunk_index INTEGER DEFAULT 0,

  -- Vector embedding (OpenAI text-embedding-3-small = 1536 dims)
  embedding vector(1536),

  -- Metadata
  metadata JSONB DEFAULT '{}'
);

-- ─────────────────────────────────────────
-- DOCUMENTS TABLE (uploaded files)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  name TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER,
  storage_path TEXT, -- Supabase Storage path
  category TEXT,
  description TEXT,

  -- Processing status
  processed BOOLEAN DEFAULT FALSE,
  chunk_count INTEGER DEFAULT 0,
  error TEXT,

  uploaded_by TEXT DEFAULT 'admin'
);

-- ─────────────────────────────────────────
-- ACTIVITY LOG TABLE
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  description TEXT,
  performed_by TEXT DEFAULT 'system',
  metadata JSONB DEFAULT '{}'
);

-- ─────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_conversations_session_id ON conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_conversations_lead_id ON conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_source ON knowledge_chunks(source_file);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_category ON knowledge_chunks(category);

-- Vector similarity search index (HNSW for best performance)
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding 
  ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);

-- ─────────────────────────────────────────
-- FUNCTIONS
-- ─────────────────────────────────────────

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Semantic search function
CREATE OR REPLACE FUNCTION match_knowledge_chunks(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  source_file TEXT,
  category TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    knowledge_chunks.id,
    knowledge_chunks.content,
    knowledge_chunks.source_file,
    knowledge_chunks.category,
    1 - (knowledge_chunks.embedding <=> query_embedding) AS similarity
  FROM knowledge_chunks
  WHERE 1 - (knowledge_chunks.embedding <=> query_embedding) > match_threshold
  ORDER BY knowledge_chunks.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ─────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────
-- Disable RLS for server-side access (service role bypasses anyway)
-- Enable RLS if you want row-level control per user

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Service role bypass (used in API routes)
CREATE POLICY "Service role full access" ON leads
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON conversations
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON knowledge_chunks
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON documents
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON activity_logs
  FOR ALL USING (auth.role() = 'service_role');

-- Anon can insert conversations and leads (chatbot creates them)
CREATE POLICY "Anon can insert leads" ON leads
  FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Anon can insert conversations" ON conversations
  FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Anon can update own conversations" ON conversations
  FOR UPDATE USING (TRUE);

-- ─────────────────────────────────────────
-- STORAGE BUCKET
-- ─────────────────────────────────────────
-- Run in Supabase Dashboard → Storage → Create bucket named "documents"
-- Or via API:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);
