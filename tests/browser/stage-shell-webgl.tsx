import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import App from '../../src/App'

const rootElement = document.getElementById('root')
const statusElement = document.getElementById('acceptance-status')
if (!rootElement || !statusElement) throw new Error('Acceptance fixture root is missing.')

let uncaughtErrors = 0
const originalConsoleError = console.error
console.error = (...args: unknown[]) => {
  uncaughtErrors += 1
  originalConsoleError(...args)
}
window.addEventListener('error', () => { uncaughtErrors += 1 })
window.addEventListener('unhandledrejection', () => { uncaughtErrors += 1 })

createRoot(rootElement).render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>)

function waitFor(predicate: () => boolean, timeoutMs = 12_000): Promise<boolean> {
  return new Promise((resolve) => {
    const started = performance.now()
    const check = () => {
      if (predicate()) return resolve(true)
      if (performance.now() - started >= timeoutMs) return resolve(false)
      window.setTimeout(check, 40)
    }
    check()
  })
}

async function runAcceptance() {
  const webGLAvailable = (() => {
    try { return Boolean(document.createElement('canvas').getContext('webgl')) } catch { return false }
  })()
  let pagesPassed = 0
  const dashboardReady = await waitFor(() => rootElement.querySelector('.stage-shell') !== null)
  if (dashboardReady) {
    const stages = [...rootElement.querySelectorAll('.stage-shell')]
    const pass = stages.length === 1 && stages.every((stage) => stage.querySelector('[data-testid="stage-fallback"]') !== null && stage.querySelector('canvas') === null)
    if (pass) pagesPassed += 1
  }

  const scanLink = rootElement.querySelector<HTMLAnchorElement>('a[href="/scans/demo-scan-2026-014"]')
  scanLink?.click()
  const detailsReady = await waitFor(() => rootElement.textContent?.includes('Contract dependency map') ?? false)
  if (detailsReady) {
    const stages = [...rootElement.querySelectorAll('.stage-shell')]
    const pass = stages.length === 1 && stages.every((stage) => stage.querySelector('[data-testid="stage-fallback"]') !== null && stage.querySelector('canvas') === null)
    if (pass) pagesPassed += 1
  }

  const stageCount = rootElement.querySelectorAll('.stage-shell').length
  const fallbackCount = rootElement.querySelectorAll('[data-testid="stage-fallback"]').length
  const canvasCount = rootElement.querySelectorAll('.stage-shell canvas').length
  const passed = !webGLAvailable && pagesPassed === 2 && stageCount === 1 && fallbackCount === 1 && canvasCount === 0 && uncaughtErrors === 0
  statusElement.textContent = passed
    ? 'PASS — WebGL disabled; dashboard and scan details show their 2D fallbacks; no uncaught errors.'
    : `FAIL — WebGL ${webGLAvailable ? 'available' : 'disabled'}; ${pagesPassed}/2 page fallbacks; ${stageCount} stage(s), ${fallbackCount} fallback(s), ${canvasCount} canvas(es), ${uncaughtErrors} uncaught error(s).`
  document.body.dataset.acceptance = passed ? 'pass' : 'fail'
  console.error = originalConsoleError
}

void runAcceptance()
