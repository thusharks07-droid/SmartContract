import type { Theme } from '../types/theme'

export type AppSettings = {
  theme: Theme
  workspaceName: string
  defaultView: 'dashboard' | 'history'
  defaultOptions: { reentrancy: boolean; accessControl: boolean; staticAnalysis: boolean }
  defaultCompilerVersion: string
  reportDisplay: { showVerification: boolean; showRemediations: boolean }
  visualFidelity: 'enhanced' | 'standard' | 'minimal'
  motion: 'full' | 'reduced'
  motionExplicit: boolean
}
const storageKey = 'contractiq.settings'
const defaultSettings: AppSettings = {
  theme: 'dark',
  workspaceName: 'ContractIQ Demo',
  defaultView: 'dashboard',
  defaultOptions: { reentrancy: true, accessControl: true, staticAnalysis: true },
  defaultCompilerVersion: '0.8.24',
  reportDisplay: { showVerification: true, showRemediations: true },
  visualFidelity: 'standard',
  motion: 'full',
  motionExplicit: false,
}
let sessionSettings: AppSettings = structuredClone(defaultSettings)

function readStoredSettings(): AppSettings {
  try {
    const stored = window.localStorage.getItem(storageKey)
    if (stored) {
      const parsed: unknown = JSON.parse(stored)
      if (typeof parsed === 'object' && parsed !== null) {
        const stored = parsed as Partial<AppSettings>
        const theme = stored.theme
        return {
          ...defaultSettings,
          ...stored,
          motionExplicit: typeof stored.motionExplicit === 'boolean'
            ? stored.motionExplicit
            : Object.prototype.hasOwnProperty.call(stored, 'motion'),
          theme: theme === 'dark' || theme === 'light' || theme === 'system' ? theme : defaultSettings.theme,
          defaultOptions: { ...defaultSettings.defaultOptions, ...stored.defaultOptions },
          reportDisplay: { ...defaultSettings.reportDisplay, ...stored.reportDisplay },
        }
      }
    }
    // Preserve the Part 1 theme preference while moving persistence behind this service.
    const legacyTheme = window.localStorage.getItem('contractiq.theme')
    if (legacyTheme === 'dark' || legacyTheme === 'light' || legacyTheme === 'system') return { ...defaultSettings, theme: legacyTheme }
  } catch {
    // Session settings remain available if browser storage is unavailable.
  }
  return sessionSettings
}

export const settingsService = {
  get(): AppSettings {
    sessionSettings = readStoredSettings()
    return { ...sessionSettings }
  },

  set(next: Partial<AppSettings>): AppSettings {
    sessionSettings = {
      ...sessionSettings,
      ...next,
      defaultOptions: { ...sessionSettings.defaultOptions, ...next.defaultOptions },
      reportDisplay: { ...sessionSettings.reportDisplay, ...next.reportDisplay },
    }
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(sessionSettings))
    } catch {
      // The current session still applies settings when browser storage is unavailable.
    }
    window.dispatchEvent(new CustomEvent('contractiq:settings-updated', { detail: sessionSettings }))
    return { ...sessionSettings }
  },
}
