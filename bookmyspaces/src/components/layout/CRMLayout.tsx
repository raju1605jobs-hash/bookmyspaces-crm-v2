'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/whatsapp', label: 'WhatsApp' },
  { href: '/proposals', label: 'Proposals' },
  { href: '/campaigns', label: 'Campaigns' },
  { href: '/kanban', label: 'Kanban' },
  { href: '/settings', label: 'Settings' },
]

export default function CRMLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-black text-white p-5">
        <h1 className="text-2xl font-bold mb-8">
          BookMySpaces
        </h1>

        <nav className="space-y-2">
          {links.map((link) => {
            const active = pathname.startsWith(link.href)

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`block rounded-lg px-4 py-3 transition ${
                  active
                    ? 'bg-white text-black font-semibold'
                    : 'hover:bg-gray-800'
                }`}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 overflow-auto">
        {children}
      </main>
    </div>
  )
}