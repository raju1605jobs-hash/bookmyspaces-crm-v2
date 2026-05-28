import type { Metadata } from 'next'
import CRMLayout from '@/components/layout/CRMLayout'

export const metadata: Metadata = {
  title: 'CRM Dashboard — BookMySpaces',
  description: 'Hospitality CRM and lead management system',
  robots: 'noindex, nofollow',
}

export default function CRMGroupLayout({ children }: { children: React.ReactNode }) {
  return <CRMLayout>{children}</CRMLayout>
}
