import type { LucideIcon } from 'lucide-react'
import {
  FilePlus2,
  LayoutDashboard,
  Settings2,
  ShieldAlert,
} from 'lucide-react'

export type NavigationItem = {
  label: string
  path: string
  icon: LucideIcon
  badge?: string
  badgeTone?: 'neutral' | 'info' | 'warning'
}

export const routeItems: NavigationItem[] = [
  { label: 'Overview', path: '/app/dashboard', icon: LayoutDashboard },
  { label: 'New Scan', path: '/app/new-scan', icon: FilePlus2, badge: 'DEMO', badgeTone: 'info' },
  { label: 'Scan History', path: '/app/scans', icon: ShieldAlert },
]

export const utilityItems: NavigationItem[] = [
  { label: 'Settings', path: '/app/settings', icon: Settings2 },
]

export const pageTitles: Record<string, string> = Object.fromEntries(
  [...routeItems, ...utilityItems].map(({ path, label }) => [path, label]),
)
