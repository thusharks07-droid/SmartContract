import { createContext } from 'react'
import type { Theme } from '../types/theme'

export type ThemeContextValue = {
  theme: Theme
  setTheme: (theme: Theme) => void
  cycleTheme: () => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)
