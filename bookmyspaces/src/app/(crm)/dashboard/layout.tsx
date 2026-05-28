import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'CRM Dashboard — BookMySpaces',
  description: 'Hospitality CRM and lead management system',
  robots: 'noindex, nofollow',
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
