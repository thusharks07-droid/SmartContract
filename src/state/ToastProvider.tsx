import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { Check, Info, TriangleAlert, X } from 'lucide-react'
import type { ToastMessage } from '../types/domain'
import { ToastContext } from './ToastContext'

const toastPresets = {
  draftSaved: { title: 'Draft saved', description: 'Saved in this demo workspace.', tone: 'success' },
  demoQueued: { title: 'Demo analysis queued', description: 'This is a deterministic demo state. No real security checks are running.', tone: 'info' },
  reportExported: { title: 'Report exported', description: 'The report file was created in this browser session.', tone: 'success' },
  settingsSaved: { title: 'Settings saved', description: 'Your preferences are stored in this browser.', tone: 'success' },
} as const

export function ToastProvider({ children }: PropsWithChildren) {
  const [messages, setMessages] = useState<ToastMessage[]>([])
  const nextId = useRef(0)
  const timers = useRef(new Map<number, number>())

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer !== undefined) window.clearTimeout(timer)
    timers.current.delete(id)
    setMessages((current) => current.filter((message) => message.id !== id))
  }, [])

  const notify = useCallback((message: Omit<ToastMessage, 'id'>) => {
    const id = nextId.current++
    setMessages((current) => [...current, { ...message, id }].slice(-4))
    timers.current.set(id, window.setTimeout(() => dismiss(id), 4800))
  }, [dismiss])

  const value = useMemo(() => ({
    notify,
    draftSaved: () => notify(toastPresets.draftSaved),
    demoQueued: () => notify(toastPresets.demoQueued),
    reportExported: () => notify(toastPresets.reportExported),
    settingsSaved: () => notify(toastPresets.settingsSaved),
    validationErrors: (count: number) => notify({
      title: `${count} validation ${count === 1 ? 'error' : 'errors'}`,
      description: 'Review the highlighted fields and try again.',
      tone: 'warning',
    }),
  }), [notify])

  useEffect(() => () => {
    for (const timer of timers.current.values()) window.clearTimeout(timer)
    timers.current.clear()
  }, [])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-viewport" role="region" aria-label="Notifications" aria-live="polite" aria-relevant="additions text">
        {messages.map((message) => {
          const Icon = message.tone === 'success' ? Check : message.tone === 'warning' || message.tone === 'error' ? TriangleAlert : Info
          return (
            <div key={message.id} className={`toast toast--${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>
              <Icon size={17} aria-hidden="true" />
              <div className="toast__copy"><strong>{message.title}</strong>{message.description && <span>{message.description}</span>}</div>
              <button className="toast__dismiss" type="button" aria-label={`Dismiss ${message.title}`} onClick={() => dismiss(message.id)}><X size={15} /></button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
