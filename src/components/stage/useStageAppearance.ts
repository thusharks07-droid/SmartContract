import { useEffect, useState } from 'react'
import { useVisualFidelity } from '../../state/useVisualFidelity'

/** Live theme and fidelity inputs shared by every optional 3D scene. */
export function useStageAppearance() {
  const { visualFidelity } = useVisualFidelity()
  const [lightTheme, setLightTheme] = useState(() => document.documentElement.dataset.theme === 'light')

  useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => setLightTheme(root.dataset.theme === 'light'))
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  return { enhanced: visualFidelity === 'enhanced', lightTheme }
}
