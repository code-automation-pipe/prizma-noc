import { DashboardClient } from '@/components/dashboard/DashboardClient'
import type { DashboardData } from '@/types'

export const revalidate = 60

async function getDashboardData(): Promise<DashboardData | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? `https://${process.env.VERCEL_URL ?? 'localhost:3000'}`
    const res = await fetch(`${baseUrl}/api/dashboard`, {
      next: { revalidate: 60 },
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export default async function DashboardPage() {
  const initialData = await getDashboardData()

  return <DashboardClient initialData={initialData} />
}
