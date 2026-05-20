import type { Metadata } from 'next'
import './globals.css'
import { Toaster } from 'sonner'
import ChatWidget from '@/components/chatbot/ChatWidget'

export const metadata: Metadata = {
  title: 'BookMySpaces — Premium Event & Hospitality | Kolkata',
  description:
    'Book premium banquet halls, homestays, and event venues in Kolkata. Skyline Serenity near the airport and Monurama Homestay on EM Bypass. Weddings, corporate events, birthdays and more.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <ChatWidget />
        <Toaster position="top-right" richColors />
      </body>
    </html>
  )
}
