import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { OnMount } from '@monaco-editor/react'
import { Clipboard, ClipboardCheck } from 'lucide-react'
import { useTheme } from '../../state/useTheme'
import { useToast } from '../../state/useToast'
import { LoadingState } from './LoadingState'
import { registerSolidityLanguage } from './solidityLanguage'

const MonacoEditor = lazy(() => import('@monaco-editor/react'))

type CodeViewerProps = {
  value: string
  language?: string
  filename?: string
  highlightLine?: number
  height?: string | number
}

export function CodeViewer({ value, language = 'sol', filename = 'Contract.sol', highlightLine, height = 420 }: CodeViewerProps) {
  const { theme } = useTheme()
  const { notify } = useToast()
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null)
  const decorationIds = useRef<string[]>([])
  const [resolvedTheme, setResolvedTheme] = useState<'vs' | 'vs-dark'>('vs-dark')
  const [copied, setCopied] = useState(false)

  const paintLine = useCallback(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco) return
    const line = highlightLine && highlightLine > 0 ? Math.min(highlightLine, editor.getModel()?.getLineCount() ?? 1) : null
    decorationIds.current = editor.deltaDecorations(decorationIds.current, line ? [{
      range: new monaco.Range(line, 1, line, 1),
      options: { isWholeLine: true, className: 'code-viewer__highlight-line' },
    }] : [])
    if (line) editor.revealLineInCenter(line)
  }, [highlightLine])

  const beforeMount = (monaco: Parameters<OnMount>[1]) => registerSolidityLanguage(monaco)

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
    editor.updateOptions({
      readOnly: true,
      lineNumbers: 'on',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      wordWrap: 'on',
      renderLineHighlight: 'none',
      padding: { top: 10, bottom: 10 },
    })
    paintLine()
  }

  useEffect(() => {
    const updateTheme = () => setResolvedTheme(document.documentElement.dataset.theme === 'light' ? 'vs' : 'vs-dark')
    updateTheme()
    const observer = new MutationObserver(updateTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [theme])

  useEffect(() => paintLine(), [paintLine])

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      notify({ title: 'Code copied', description: 'The read-only excerpt was copied to your clipboard.', tone: 'success' })
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      notify({ title: 'Clipboard unavailable', description: 'Copying is unavailable in this browser context.', tone: 'warning' })
    }
  }

  return (
    <section className="code-viewer" aria-label={`Read-only source: ${filename}`}>
      <header className="code-viewer__header">
        <div className="code-viewer__file"><span className="code-viewer__file-dot" aria-hidden="true" />{filename}<span className="code-viewer__language">{language}</span></div>
        <button className="button button--secondary button--small" type="button" onClick={copyCode}>
          {copied ? <ClipboardCheck size={14} aria-hidden="true" /> : <Clipboard size={14} aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy code'}
        </button>
      </header>
      <Suspense fallback={<LoadingState label="Loading code editor" rows={5} />}>
        <MonacoEditor height={height} language={language === 'sol' ? 'solidity' : language} value={value} theme={resolvedTheme} beforeMount={beforeMount} onMount={onMount} options={{ readOnly: true, lineNumbers: 'on', minimap: { enabled: false }, scrollBeyondLastLine: false, automaticLayout: true }} />
      </Suspense>
    </section>
  )
}
