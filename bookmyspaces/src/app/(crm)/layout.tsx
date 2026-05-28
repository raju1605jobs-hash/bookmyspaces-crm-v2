import CRMShell from '@/components/layout/CRMShell'

export default function CRMGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <CRMShell>{children}</CRMShell>
}
