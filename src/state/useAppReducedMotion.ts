import { useEffect, useState } from 'react'
import { settingsService } from '../services/settingsService'

function useSystemReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(preference.matches)
    update()
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])
  return reducedMotion
}

export function useAppReducedMotion() {
  const systemReducedMotion = useSystemReducedMotion()
  const [settings, setSettings] = useState(() => settingsService.get())
  useEffect(() => {
    const update = () => setSettings(settingsService.get())
    window.addEventListener('contractiq:settings-updated', update)
    window.addEventListener('storage', update)
    return () => {
      window.removeEventListener('contractiq:settings-updated', update)
      window.removeEventListener('storage', update)
    }
  }, [])
  const reducedMotion = settings.motionExplicit ? settings.motion === 'reduced' : Boolean(systemReducedMotion)
  useEffect(() => {
    document.documentElement.dataset.motion = reducedMotion ? 'reduced' : 'full'
  }, [reducedMotion])
  return reducedMotion
}
