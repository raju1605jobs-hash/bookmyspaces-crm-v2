import { getSupabaseAdmin } from './supabase'
import { logger } from './logger'
import { generateEmbedding, chunkText } from './ai'

const supabaseAdmin = getSupabaseAdmin()

// ─────────────────────────────────────────
// DOCUMENT PROCESSING — Build Knowledge Base
// ─────────────────────────────────────────

export async function processTextIntoKnowledgeBase(
  text: string,
  sourceFile: string,
  sourceType: 'pdf' | 'docx' | 'txt' | 'manual',
  category: 'packages' | 'faq' | 'menu' | 'policies' | 'branding' | 'scripts' | 'general'
): Promise<number> {
  const chunks = chunkText(text, 800, 100)
  let processedCount = 0

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]

    try {
      const embedding = await generateEmbedding(chunk)

      const { error } = await supabaseAdmin.from('knowledge_chunks').insert({
        source_file: sourceFile,
        source_type: sourceType,
        category,
        content: chunk,
        chunk_index: i,
        embedding,
        metadata: { total_chunks: chunks.length },
      })

      if (error) {
        logger.error('documents', `Failed to insert chunk ${i}`, error)
      } else {
        processedCount++
      }

      // Small delay to avoid OpenAI rate limits
      await new Promise(r => setTimeout(r, 50))
    } catch (err) {
      logger.error('documents', `Error processing chunk ${i}`, err)
    }
  }

  return processedCount
}

// Delete all chunks for a source file
export async function deleteKnowledgeBySource(sourceFile: string): Promise<void> {
  await supabaseAdmin
    .from('knowledge_chunks')
    .delete()
    .eq('source_file', sourceFile)
}

// Get all documents
export async function getDocuments() {
  const { data, error } = await supabaseAdmin
    .from('documents')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

// Seed knowledge base from business data (static)
export const STATIC_KNOWLEDGE: Array<{
  text: string
  source: string
  category: 'packages' | 'faq' | 'menu' | 'policies' | 'branding' | 'scripts' | 'general'
}> = [
  {
    source: 'packages_2026',
    category: 'packages',
    text: `BOOK MY SPACES ROOFTOP EVENT PACKAGES 2026
Location: Mukundapur, Near EM Bypass, Kolkata
Private Rooftop Events for 30-70 Guests

SILVER PACKAGE — ₹42,000 (Up to 60 Guests)
Includes: Rooftop venue (4 hours), Basic decoration, Buffet dinner (veg + non-veg), Sound system & music, Basic lighting, Event support staff

GOLD PACKAGE — ₹50,000 (Up to 60 Guests) ⭐ MOST POPULAR
Includes: Rooftop venue (4 hours), Premium decoration, Buffet dinner (expanded menu), Sound system + microphone, Party lighting setup, Cake table setup, Event support staff

PLATINUM PACKAGE — ₹59,500 (Up to 60 Guests)
Includes: Rooftop venue (5 hours), Premium theme decoration, Full buffet dinner, DJ music setup, Party lighting, Welcome drink, Cake table + stage setup, Event coordination

ADD-ONS:
- Additional Music Setup: ₹6,000
- Photography Package: ₹8,000
- Extra Guest (per person): ₹750
- Theme Decoration: ₹5,000–₹12,000

Maximum capacity: 70 guests
Contact: 9051459463 / 7003853624`,
  },
  {
    source: 'venues_info',
    category: 'general',
    text: `BOOKMYSPACES PROPERTIES:

1. SKYLINE SERENITY (Near Kolkata Airport)
- Deluxe & Premium AC Rooms
- Starting from ₹999/night
- Features: AC, attached washroom, geyser, wardrobe, smart TV, high-speed WiFi
- Couple-friendly property
- In-house dining available
- Website: www.bookmyspaces.in
- Phone: 9830509991 / 9123005489

2. MONURAMA HOMESTAY (Mukundapur, Near EM Bypass)
- Rooms for stay (starting ₹999)
- Open-Air Café "Under the Mango Tree" — from ₹249
- Rooftop space for parties and events
- Private Dining Room — from ₹4,999 (couples, intimate celebrations)
- Open-Air Banquet Hall
- Phone: 9051459463 / 7003853624

Perfect for: Birthday Parties, Engagement Ceremonies, Anniversary Celebrations, Corporate Gatherings, Private Dinner Events, Family Get-togethers`,
  },
  {
    source: 'faq_general',
    category: 'faq',
    text: `FREQUENTLY ASKED QUESTIONS:

Q: Is advance booking required?
A: Yes, especially for weekends. Weekend dates fill fast — advance booking strongly recommended. A small advance secures your slot.

Q: Is the venue couple-friendly?
A: Yes, both Skyline Serenity and Monurama are couple-friendly properties.

Q: Can I arrange food through you?
A: Yes! We offer buffet dinners with both veg and non-veg options. Food packages can be customized based on guest count, preferences, and occasion.

Q: Can I get a site visit before booking?
A: Absolutely! You're welcome to visit and see the venue. Please call ahead to schedule: 9051459463.

Q: What's the cancellation policy?
A: Please contact us directly for cancellation details — it varies by package and date.

Q: Do you allow outside food/catering?
A: Generally not for event packages (food is included), but please contact us for specific requirements.

Q: What payment modes are accepted?
A: UPI, bank transfer. Advance required to confirm booking.

Q: Is parking available?
A: Yes, parking is available. Please confirm while booking.

Q: Can I customize decorations?
A: Yes! Theme decoration is available as an add-on from ₹5,000–₹12,000. We work with reliable decorators.

Q: What is the maximum guest capacity?
A: The rooftop venue can accommodate up to 70 guests comfortably.`,
  },
  {
    source: 'booking_process',
    category: 'policies',
    text: `BOOKING PROCESS:
1. Inquiry → Share event details (date, guests, occasion, preferences)
2. Venue suggestion → We suggest the best package
3. Site visit (optional) → Visit the venue before confirming
4. Confirmation → Pay advance to block your date
5. Event day → Our team manages the setup and coordination

IMPORTANT POLICIES:
- Dates are not blocked without advance payment
- Weekend slots (Saturday, Sunday) fill very fast — book early
- Food menu customization must be confirmed 3-5 days before event
- Photography add-on must be booked in advance
- Exact timing must be confirmed while booking

CONTACT:
WhatsApp / Call: 9051459463 or 7003853624
Website: www.bookmyspaces.in`,
  },
  {
    source: 'cafe_dining',
    category: 'menu',
    text: `MONURAMA CAFÉ — "Under the Mango Tree"
Open-Air Café experience starting from ₹249
Perfect for: Dates, Friend hangouts, Evening gatherings, Small celebrations

PRIVATE DINING ROOM:
Packages starting from ₹4,999
Ideal for: Couple dinners, Mini birthday surprises, Small intimate celebrations, Proposals
Please share date, time & number of guests to get exact pricing.

LUNCH/DINNER EVENTS:
Food can be arranged for events. Menu options:
- Veg / Non-veg / Both available
- Buffet format for larger groups
- Set menu for smaller intimate events
Food pricing is confirmed after discussing requirements with our kitchen team.`,
  },
]
