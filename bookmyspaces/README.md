# BookMySpaces AI CRM — Phase 1 Complete

## 🏨 System Overview

A production-ready AI-powered hospitality CRM for:
- **BookMySpaces.in** — Platform
- **Skyline Serenity** — Near Kolkata Airport
- **Monurama Homestay** — Mukundapur, EM Bypass

---

## 📦 What's Built (Phase 1)

| Feature | Status |
|---|---|
| Next.js 14 App | ✅ |
| Supabase DB + RLS | ✅ |
| AI Chatbot (Aria) | ✅ |
| Claude API (Primary) | ✅ |
| OpenAI Fallback | ✅ |
| RAG / Vector Search | ✅ |
| CRM Dashboard | ✅ |
| Lead Pipeline | ✅ |
| Google Sheets Sync | ✅ |
| Knowledge Base Seeding | ✅ |
| Admin Panel | ✅ |
| Health Check | ✅ |
| Mobile Responsive | ✅ |
| Premium UI (Gold theme) | ✅ |

---

## 🚀 Local Setup (Step by Step)

### 1. Install Dependencies

```bash
cd bookmyspaces
npm install
```

### 2. Create Environment File

```bash
cp .env.example .env.local
# Fill in all values in .env.local
```

### 3. Set Up Supabase

1. Go to [supabase.com](https://supabase.com) → Create new project
2. Copy your **Project URL**, **Anon Key**, and **Service Role Key** to `.env.local`
3. Go to **SQL Editor** → Run the file: `supabase/migrations/001_initial_schema.sql`
4. Go to **Storage** → Create bucket named `documents` (set to private)
5. Enable **pgvector** extension: Settings → Database Extensions → enable `vector`

### 4. Get Google Sheets Sync (Optional but recommended)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create project → Enable **Google Sheets API**
3. Create Service Account → Download JSON key
4. Create a new Google Sheet → Copy the Sheet ID from URL
5. Share the Sheet with the service account email (Editor access)
6. Add to `.env.local`:
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` = service account email
   - `GOOGLE_PRIVATE_KEY` = private key from JSON
   - `GOOGLE_SHEETS_ID` = sheet ID from URL

### 5. Run Development Server

```bash
npm run dev
```

Open: [http://localhost:3000](http://localhost:3000)

### 6. Seed Knowledge Base

1. Go to [http://localhost:3000/admin](http://localhost:3000/admin)
2. Run **Health Check** to verify all services
3. Click **"Seed Static Business Knowledge"**
4. Wait ~30 seconds for embeddings to process
5. Test the chatbot — it should now answer about packages, pricing, etc.

---

## 🌐 Vercel Deployment

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "BookMySpaces AI CRM Phase 1"
git remote add origin https://github.com/YOUR_USERNAME/bookmyspaces-crm.git
git push -u origin main
```

### 2. Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) → Import GitHub repo
2. Framework: **Next.js**
3. Add all environment variables from `.env.local`
4. Deploy!

### 3. Set Up Production

After deployment:
1. Visit `YOUR_URL/admin`
2. Run Health Check
3. Seed Knowledge Base
4. Test chatbot at `YOUR_URL`

---

## 🔑 Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key (server only) |
| `ANTHROPIC_API_KEY` | ✅ | Claude API key from console.anthropic.com |
| `OPENAI_API_KEY` | ✅ | OpenAI key for embeddings |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | ⚠️ | For Google Sheets sync |
| `GOOGLE_PRIVATE_KEY` | ⚠️ | Google service account private key |
| `GOOGLE_SHEETS_ID` | ⚠️ | Target spreadsheet ID |

---

## 📁 Project Structure

```
bookmyspaces/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Public homepage
│   │   ├── layout.tsx            # Root layout + ChatWidget
│   │   ├── globals.css           # Design system + fonts
│   │   ├── dashboard/
│   │   │   └── page.tsx          # CRM Dashboard
│   │   ├── admin/
│   │   │   └── page.tsx          # Admin panel
│   │   └── api/
│   │       ├── chat/route.ts     # AI chat endpoint
│   │       ├── leads/route.ts    # CRM CRUD
│   │       ├── knowledge/route.ts # RAG management
│   │       └── health/route.ts   # System health
│   ├── components/
│   │   └── chatbot/
│   │       └── ChatWidget.tsx    # Floating AI chatbot
│   └── lib/
│       ├── supabase.ts          # DB client + types
│       ├── ai.ts                # Claude + OpenAI + RAG
│       ├── sheets.ts            # Google Sheets sync
│       └── documents.ts         # Knowledge base processor
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
├── .env.example
├── next.config.js
├── tailwind.config.ts
└── package.json
```

---

## 🧪 Testing Checklist

- [ ] Homepage loads at `/`
- [ ] Chat widget appears and opens
- [ ] Aria responds to "hello"
- [ ] Aria answers about packages (after knowledge seeding)
- [ ] Lead created in Supabase after providing name + phone
- [ ] Dashboard shows leads at `/dashboard`
- [ ] Status can be updated in dashboard
- [ ] WhatsApp link works from dashboard
- [ ] Admin health check passes at `/admin`
- [ ] Knowledge seeding completes successfully
- [ ] Google Sheets receives lead data

---

## 🛠️ Troubleshooting

**Chat not responding:**
- Check `ANTHROPIC_API_KEY` in env
- Check `/api/health` for error details

**Knowledge base empty:**
- Go to Admin → Seed Static Knowledge
- Ensure `OPENAI_API_KEY` is set (used for embeddings)

**Supabase errors:**
- Ensure you ran the migration SQL
- Ensure `pgvector` extension is enabled
- Ensure RLS policies allow service role

**Google Sheets not syncing:**
- Verify service account email has Edit access to the sheet
- Check `GOOGLE_PRIVATE_KEY` has newlines escaped properly

---

## 📞 Business Contact Info (Built-in)

- **BookMySpaces:** www.bookmyspaces.in
- **Monurama:** 9051459463 / 7003853624
- **Skyline:** 9830509991 / 9123005489

---

## ⏭️ Phase 2 (Next): WhatsApp AI Automation

Phase 2 will add:
- Wati.io / Interakt webhook integration
- AI auto-replies on WhatsApp
- Voice note transcription
- WhatsApp → CRM sync
- Campaign messaging
