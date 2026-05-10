import type { Metadata } from 'next'
import './globals.css'
import { Toaster } from 'sonner'
import { ChatWidget } from '@/components/chatbot/ChatWidget'

export const metadata: Metadata = {
  title: 'BookMySpaces — Premium Event & Hospitality | Kolkata',
  description:
    'Book rooftop events, private dining, banquet halls & rooms at Skyline Serenity and Monurama Homestay in Kolkata. Silver ₹42,000 | Gold ₹50,000 | Platinum ₹59,500',
  keywords: [
    'rooftop event venue kolkata',
    'banquet hall mukundapur',
    'birthday party venue kolkata',
    'private dining kolkata',
    'book my spaces',
    'monurama homestay',
    'skyline serenity',
  ],
  openGraph: {
    title: 'BookMySpaces — Premium Event Venues in Kolkata',
    description: 'Private rooftop events, dining & stay. Packages from ₹42,000.',
    type: 'website',
    url: 'https://bookmyspaces.in',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        {/* Preconnect for Google Fonts — loads fonts without blocking CSS */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        {children}
        <ChatWidget />
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              fontFamily: "'DM Sans', 'Segoe UI', Arial, system-ui, sans-serif",
              borderRadius: '8px',
            },
          }}
        />
      </body>
    </html>
  )
}
