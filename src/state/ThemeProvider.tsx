import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { ThemeContext } from './ThemeContext'
import type { Theme } from '../types/theme'
import { settingsService } from '../services/settingsService'

const themeCycle: Theme[] = ['system', 'dark', 'light']

function getSavedTheme(): Theme {
  return settingsService.get().theme
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setThemeState] = useState<Theme>(getSavedTheme)

  const setTheme = useCallback((nextTheme: Theme) => {
    setThemeState(nextTheme)
    settingsService.set({ theme: nextTheme })
  }, [])

  const cycleTheme = useCallback(() => {
    const nextIndex = (themeCycle.indexOf(theme) + 1) % themeCycle.length
    setTheme(themeCycle[nextIndex] ?? 'dark')
  }, [setTheme, theme])

  useEffect(() => {
    document.documentElement.dataset.fidelity = settingsService.get().visualFidelity
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const applyTheme = () => {
      const resolved = theme === 'system' ? (media.matches ? 'light' : 'dark') : theme
      document.documentElement.dataset.theme = resolved
      document.documentElement.style.colorScheme = resolved
    }

    applyTheme()
    if (theme !== 'system') return

    media.addEventListener('change', applyTheme)
    return () => media.removeEventListener('change', applyTheme)
  }, [theme])

  const value = useMemo(() => ({ theme, setTheme, cycleTheme }), [cycleTheme, setTheme, theme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
