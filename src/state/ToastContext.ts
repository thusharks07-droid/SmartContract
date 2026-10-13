import { createContext } from 'react'
import type { ToastMessage } from '../types/domain'

export type ToastApi = {
  notify: (message: Omit<ToastMessage, 'id'>) => void
  draftSaved: () => void
  demoQueued: () => void
  reportExported: () => void
  settingsSaved: () => void
  validationErrors: (count: number) => void
}

export const ToastContext = createContext<ToastApi | null>(null)
