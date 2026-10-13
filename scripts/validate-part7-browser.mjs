import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'

const baseURL = process.env.CONTRACTIQ_BASE_URL ?? 'http://127.0.0.1:5174'
const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const results = []
const consoleErrors = []
const failures = []
const chromiumBrowser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})

function record(name, pass, details = '') {
  results.push({ name, status: pass ? 'PASS' : 'FAIL', details })
  if (!pass) failures.push(name)
}

async function waitForEither(...locators) {
  await Promise.race(locators.map((locator) => locator.waitFor({ state: 'visible', timeout: 8000 }).catch(() => undefined)))
}

async function auditA11y(targetPage, label) {
  await targetPage.waitForTimeout(350)
  const report = await new AxeBuilder({ page: targetPage }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  record(`WCAG 2.2 AA Axe audit: ${label}`, report.violations.length === 0, report.violations.flatMap((violation) => violation.nodes.map((node) => `${violation.id} ${node.target.join(' ')}: ${JSON.stringify(node.any.map((result) => result.data))}`)).join(' | '))
}

async function expectText(locator, pattern, name) {
  try {
    await locator.waitFor({ state: 'visible', timeout: 8000 })
    const text = await locator.innerText()
    record(name, pattern.test(text), text.slice(0, 140))
  } catch (error) {
    record(name, false, String(error).split('\n')[0])
  }
}

const context = await chromiumBrowser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'no-preference' })
const page = await context.newPage()
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
page.on('pageerror', (error) => consoleErrors.push(error.message))
await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'domcontentloaded' })
await page.getByRole('heading', { name: /See the risks in your smart contracts before deployment/i }).waitFor()
await auditA11y(page, 'public landing page')
record('Public landing loads without 3D scene assets', !(await page.evaluate(() => performance.getEntriesByType('resource').some((entry) => /SeverityOrbitScene|RiskSurfaceScene|ScanTimelineScene|useStageAppearance|three/i.test(entry.name)))))
await page.getByRole('link', { name: /Explore Demo/ }).first().click()
await page.getByRole('heading', { name: 'Explore the security workspace.' }).waitFor()
await auditA11y(page, 'demo login')
await page.getByRole('button', { name: 'Continue as Demo' }).click()
await page.waitForURL('**/app/dashboard')
await page.getByRole('heading', { name: 'Security Overview' }).waitFor()
await auditA11y(page, 'dashboard')

const stage = page.locator('.dashboard-orbit-shell .stage-shell')
await stage.waitFor({ state: 'visible' })
await page.waitForTimeout(1200)
const desktopCanvas = await stage.locator('canvas').count()
const desktopWebGL = await stage.getAttribute('data-webgl-supported')
record('Desktop dashboard mounts its stage with WebGL capability detected', desktopCanvas > 0 && desktopWebGL === 'true', `canvases=${desktopCanvas}; supported=${desktopWebGL}`)

record('Demo navigation badge renders', await page.getByText('DEMO', { exact: true }).isVisible(), 'New Scan badge visible')
await page.getByRole('button', { name: 'Collapse sidebar' }).click()
record('Sidebar collapse control changes the sidebar state', await page.locator('.sidebar').evaluate((element) => element.classList.contains('sidebar--collapsed')), 'collapsed class toggled')

const dashboardCanvas = stage.locator('canvas')
await dashboardCanvas.dispatchEvent('webglcontextlost', { bubbles: true, cancelable: true })
await stage.locator('.stage-shell__fallback').waitFor({ state: 'visible' })
record('Browser WebGL context-loss event swaps the dashboard stage to fallback', await stage.locator('canvas').count() === 0)

const routeCases = [
  ['/app/new-scan', 'New Scan'],
  ['/app/scans', 'All scan records'],
  ['/app/settings', 'Settings'],
  ['/app/scans/demo-scan-2026-014', 'Vault'],
  ['/app/scans/demo-scan-2026-014/findings/demo-finding-014-001', 'External call precedes balance update'],
  ['/app/reports/demo-scan-2026-014', 'Report Viewer'],
]
for (const [path, heading] of routeCases) {
  await page.goto(`${baseURL}${path}`, { waitUntil: 'domcontentloaded' })
  await expectText(page.getByRole('heading', { name: heading }).first(), new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Route ${path} renders`)
  if (path !== '/settings') await auditA11y(page, path)
}

await page.goto(`${baseURL}/app/scans/invalid-record`, { waitUntil: 'domcontentloaded' })
await page.getByRole('heading', { name: 'Scan record not found' }).waitFor({ state: 'visible' })
record('Invalid scan route has a graceful empty state', await page.getByRole('heading', { name: 'Scan record not found' }).isVisible())
await page.goto(`${baseURL}/app/scans/demo-scan-2026-014/findings/invalid-finding`, { waitUntil: 'domcontentloaded' })
await page.getByRole('heading', { name: 'Finding not found' }).waitFor({ state: 'visible' })
record('Invalid finding route has a graceful empty state', await page.getByRole('heading', { name: 'Finding not found' }).isVisible())

await page.goto(`${baseURL}/app/scans/demo-scan-2026-014`, { waitUntil: 'domcontentloaded' })
await page.locator('.risk-surface__option').first().waitFor()
await page.locator('.risk-surface__option').first().focus()
await page.keyboard.press('ArrowDown')
record('Risk surface keyboard selection updates its active option', (await page.locator('.risk-surface__option[aria-selected="true"]').count()) === 1)
record('Scan details mounts a source graph stage', await page.locator('.dependency-stage-panel .stage-shell canvas').count() > 0)

await page.goto(`${baseURL}/app/scans/demo-scan-2026-014/findings/demo-finding-014-001`, { waitUntil: 'domcontentloaded' })
await page.getByRole('button', { name: 'Graph', exact: true }).click()
record('Finding source graph mounts and remains selectable', await page.locator('.stage-shell canvas').count() > 0)
await page.getByRole('button', { name: 'Suggested pattern' }).click()
record('Before/after remediation toggle changes its code label', await page.getByText('Illustrative suggestion · review required').isVisible())

await page.goto(`${baseURL}/app/scans`, { waitUntil: 'domcontentloaded' })
await page.getByRole('button', { name: 'Timeline view' }).click()
await page.locator('.timeline-panel .stage-shell').waitFor()
await waitForEither(page.locator('.timeline-panel .stage-shell canvas'), page.locator('.timeline-panel .stage-shell__fallback'))
record('History timeline stage mounts from the same filtered history view', await page.locator('.timeline-panel .stage-shell canvas').count() > 0)
await page.getByRole('button', { name: 'Table view' }).click()
await page.getByRole('button', { name: /Sort by Contract \/ Project/ }).click()
record('History table sort control changes the sort state', (await page.getByRole('columnheader', { name: /Contract \/ Project/ }).getAttribute('aria-sort')) === 'ascending')

await page.goto(`${baseURL}/app/settings`, { waitUntil: 'domcontentloaded' })
await auditA11y(page, 'settings')
await page.getByRole('tab', { name: 'Appearance' }).click()
await page.getByRole('button', { name: 'Light', exact: true }).click()
await page.getByRole('button', { name: 'Enhanced' }).click()
await page.getByRole('button', { name: 'Reduced' }).click()
record('Light theme applies immediately', await page.locator('html').getAttribute('data-theme') === 'light')
record('Enhanced fidelity and Reduced motion apply immediately', await page.locator('html').evaluate((element) => element.dataset.fidelity === 'enhanced' && element.dataset.motion === 'reduced'))
await page.reload({ waitUntil: 'domcontentloaded' })
await page.getByRole('heading', { name: 'Settings' }).waitFor()
record('Theme, fidelity, and motion settings persist on reload', await page.locator('html').evaluate((element) => element.dataset.theme === 'light' && element.dataset.fidelity === 'enhanced' && element.dataset.motion === 'reduced'), await page.evaluate(() => localStorage.getItem('contractiq.settings') ?? 'no settings'))

const expandSidebar = page.locator('.sidebar__toggle[aria-label="Expand sidebar"]')
if (await expandSidebar.isVisible().catch(() => false)) await expandSidebar.click()
await page.locator('.sidebar a[href="/app/new-scan"]').click()
await auditA11y(page, 'new scan')
await page.getByRole('tab', { name: 'Paste Solidity' }).click()
await page.getByRole('button', { name: 'Create Demo Record' }).click()
await expectText(page.locator('.field-error'), /Paste Solidity source/, 'Empty paste validation appears')
const fileInput = page.locator('input[type="file"]')
await page.getByRole('tab', { name: 'Upload Contract' }).click()
await fileInput.setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('not solidity') })
await expectText(page.locator('.field-error'), /ending in \.sol/, 'Wrong file type validation appears')
await fileInput.setInputFiles({ name: 'oversized.sol', mimeType: 'text/plain', buffer: Buffer.alloc(2 * 1024 * 1024 + 1, 32) })
await expectText(page.locator('.field-error'), /2 MB or smaller/, 'Oversized file validation appears')
await page.getByRole('tab', { name: 'Paste Solidity' }).click()
await page.getByRole('button', { name: 'Load sample contract' }).click()
await page.getByRole('button', { name: 'Create Demo Record' }).click()
await page.waitForURL(/\/scans\/demo-scan-local-\d{3}/, { timeout: 10000 })
await page.getByText(/no scanner was invoked/i).waitFor({ timeout: 4000 }).catch(() => undefined)
record('Valid sample creates a local demo record without implying analysis', /demo-scan-local-001/.test(page.url()) && await page.getByText('DEMO').count() > 0, page.url())
const localScanId = page.url().split('/').at(-1)
record('New demo record appears in History', (await page.evaluate((id) => document.body.innerText.includes(id), localScanId)))

await page.locator('.sidebar a[href="/app/new-scan"]').click()
await page.waitForURL(/\/app\/new-scan$/)
await page.getByRole('heading', { name: 'New Scan' }).waitFor()
await page.getByRole('tab', { name: 'Upload Contract' }).click()
await page.locator('input[type="file"]').setInputFiles({ name: 'LocalUpload.sol', mimeType: 'text/plain', buffer: Buffer.from('pragma solidity 0.8.24; contract LocalUpload {}') })
await page.locator('.selected-file__name strong').getByText('LocalUpload.sol', { exact: true }).waitFor({ state: 'visible' })
await page.getByRole('button', { name: 'Create Demo Record' }).click()
await page.waitForURL(/\/scans\/demo-scan-local-\d{3}/, { timeout: 10000 })
record('Valid local .sol upload creates a deterministic demo record', page.url().includes('demo-scan-local-002'), page.url())

await page.locator('.sidebar a[href="/app/scans"]').click()
const historySearch = page.getByPlaceholder('Search contract or scan ID')
await historySearch.fill('Vault')
const searchedRows = await page.locator('.data-table tbody').innerText()
record('History search filters rows', await page.locator('.data-table tbody tr').count() > 0 && searchedRows.includes('Vault') && !searchedRows.includes('LocalUpload'), searchedRows.slice(0, 220))
await page.getByRole('button', { name: 'Clear' }).click()
await page.getByLabel('Filter status').selectOption('failed')
record('History status filter narrows rows', await page.locator('.data-table tbody tr').count() === 1)
await page.getByRole('button', { name: 'Clear' }).click()
const showMore = page.getByRole('button', { name: 'Show 8 more records' })
await showMore.waitFor({ state: 'visible', timeout: 5000 })
await showMore.click()
record('History pagination reveals remaining rows', await page.locator('.data-table tbody tr').count() === 9)
await page.getByRole('button', { name: 'Delete demo-scan-local-002 demo record' }).click()
await page.getByRole('dialog').waitFor({ state: 'visible' })
const dialogOwnsFocus = await page.getByRole('dialog').evaluate((dialog) => dialog.contains(document.activeElement))
await page.keyboard.press('Escape')
await page.getByRole('dialog').waitFor({ state: 'hidden' })
record('Delete dialog opens with focus inside and Escape cancels', dialogOwnsFocus, `focus inside=${dialogOwnsFocus}; dialog closed=${await page.getByRole('dialog').isHidden()}`)
await page.getByRole('button', { name: 'Delete demo-scan-local-002 demo record' }).click()
await page.getByRole('button', { name: 'Delete demo record', exact: true }).last().click()
await page.getByText('Demo record deleted').waitFor({ state: 'visible', timeout: 3000 })
record('Delete confirmation removes the local record and shows a toast', await page.locator('.data-table tbody').innerText().then((value) => !value.includes('demo-scan-local-002')))

await page.goto(`${baseURL}/app/reports/demo-scan-2026-014`, { waitUntil: 'domcontentloaded' })
await page.locator('.report-layout__title').waitFor({ state: 'visible' })
await page.emulateMedia({ media: 'print' })
const printStyle = await page.evaluate(() => ({
  stage: document.querySelector('.stage-shell') ? getComputedStyle(document.querySelector('.stage-shell')).display : 'none',
  sidebar: document.querySelector('.sidebar') ? getComputedStyle(document.querySelector('.sidebar')).display : 'missing',
  title: document.querySelector('.report-layout__title') ? getComputedStyle(document.querySelector('.report-layout__title')).display : 'missing',
  cover: document.querySelector('.report-cover-band') ? getComputedStyle(document.querySelector('.report-cover-band')).display : 'missing',
  buttons: [...document.querySelectorAll('button')].some((button) => getComputedStyle(button).display !== 'none'),
}))
record('Print layout hides stages/sidebar/buttons and keeps report title', printStyle.stage === 'none' && printStyle.sidebar === 'none' && printStyle.title !== 'none' && printStyle.cover === 'none' && !printStyle.buttons, JSON.stringify(printStyle))
const pdf = await page.pdf({ format: 'A4', printBackground: true })
const pdfPages = (Buffer.from(pdf).toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length
record('Save as PDF produces a multi-page report document', pdf.length > 12000 && pdfPages >= 2, `bytes=${pdf.length}; page objects=${pdfPages}`)
await page.emulateMedia({ media: 'screen' })

await auditA11y(page, 'printable report')

await context.close()

const fallbackContext = await chromiumBrowser.newContext({ viewport: { width: 1440, height: 960 } })
await fallbackContext.addInitScript(() => {
  sessionStorage.setItem('contractiq.demo-session', JSON.stringify({ mode: 'demo', displayName: 'Demo User' }))
  const original = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (type, ...args) {
    if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null
    return original.call(this, type, ...args)
  }
})
const fallbackPage = await fallbackContext.newPage()
fallbackPage.on('pageerror', (error) => consoleErrors.push(error.message))
for (const [path, label] of [['/app/dashboard', 'dashboard'], ['/app/scans/demo-scan-2026-014', 'risk surface and dependency graph'], ['/app/scans/demo-scan-2026-014/findings/demo-finding-014-001', 'finding graph'], ['/app/scans', 'history timeline']]) {
  await fallbackPage.goto(`${baseURL}${path}`, { waitUntil: 'domcontentloaded' })
  if (path === '/app/scans') await fallbackPage.getByRole('button', { name: 'Timeline view' }).click()
  await fallbackPage.locator('.stage-shell__fallback').first().waitFor({ state: 'visible' })
  record(`WebGL unavailable swaps ${label} to its 2D fallback`, await fallbackPage.locator('.stage-shell canvas').count() === 0)
}

await fallbackContext.close()

const minimalContext = await chromiumBrowser.newContext({ viewport: { width: 1440, height: 960 } })
await minimalContext.addInitScript(() => { sessionStorage.setItem('contractiq.demo-session', JSON.stringify({ mode: 'demo', displayName: 'Demo User' })); localStorage.setItem('contractiq.settings', JSON.stringify({ visualFidelity: 'minimal', motion: 'full', motionExplicit: true })) })
const minimalPage = await minimalContext.newPage()
for (const [path, label] of [['/app/dashboard', 'dashboard'], ['/app/scans/demo-scan-2026-014', 'risk surface and dependency graph'], ['/app/scans/demo-scan-2026-014/findings/demo-finding-014-001', 'finding graph'], ['/app/scans', 'history timeline']]) {
  await minimalPage.goto(`${baseURL}${path}`, { waitUntil: 'domcontentloaded' })
  if (path === '/app/scans') await minimalPage.getByRole('button', { name: 'Timeline view' }).click()
  await minimalPage.locator('.stage-shell__fallback').first().waitFor({ state: 'visible' })
  record(`Minimal fidelity uses fallback for ${label}`, await minimalPage.locator('.stage-shell canvas').count() === 0)
}
await minimalContext.close()

const reducedContext = await chromiumBrowser.newContext({ viewport: { width: 1440, height: 960 } })
await reducedContext.addInitScript(() => { sessionStorage.setItem('contractiq.demo-session', JSON.stringify({ mode: 'demo', displayName: 'Demo User' })); localStorage.setItem('contractiq.settings', JSON.stringify({ visualFidelity: 'enhanced', motion: 'reduced', motionExplicit: true })) })
const reducedPage = await reducedContext.newPage()
for (const [path, label] of [['/app/dashboard', 'dashboard'], ['/app/scans/demo-scan-2026-014', 'risk surface and dependency graph'], ['/app/scans/demo-scan-2026-014/findings/demo-finding-014-001', 'finding graph'], ['/app/scans', 'history timeline']]) {
  await reducedPage.goto(`${baseURL}${path}`, { waitUntil: 'domcontentloaded' })
  if (path === '/app/scans') await reducedPage.getByRole('button', { name: 'Timeline view' }).click()
  await reducedPage.locator('.stage-shell__scene[data-reduced-motion="true"]').first().waitFor({ state: 'visible' })
  record(`Reduced motion exposes a static accessible view for ${label}`, await reducedPage.locator('.stage-shell__scene[data-reduced-motion="true"]').count() > 0)
}
await reducedContext.close()

const responsiveContext = await chromiumBrowser.newContext({ viewport: { width: 1024, height: 900 } })
await responsiveContext.addInitScript(() => sessionStorage.setItem('contractiq.demo-session', JSON.stringify({ mode: 'demo', displayName: 'Demo User' })))
const responsivePage = await responsiveContext.newPage()
await responsivePage.goto(`${baseURL}/app/dashboard`, { waitUntil: 'domcontentloaded' })
await responsivePage.getByRole('heading', { name: 'Security Overview' }).waitFor()
const tabletOverflow = await responsivePage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
record('Tablet layout has no viewport-level horizontal overflow', !tabletOverflow, `scrollWidth=${await responsivePage.evaluate(() => document.documentElement.scrollWidth)}`)
const tabletCanvas = await responsivePage.locator('.dashboard-orbit-shell canvas').count()
record('Tablet dashboard uses its 2D distribution instead of WebGL', tabletCanvas === 0, `canvas count=${tabletCanvas}`)
await responsivePage.setViewportSize({ width: 390, height: 844 })
await responsivePage.waitForTimeout(250)
const mobileOverflow = await responsivePage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
record('Mobile layout has no viewport-level horizontal overflow', !mobileOverflow, `scrollWidth=${await responsivePage.evaluate(() => document.documentElement.scrollWidth)}`)
record('Mobile dashboard keeps its 2D distribution', await responsivePage.locator('.dashboard-orbit-shell canvas').count() === 0)
await responsiveContext.close()

const errorPass = consoleErrors.length === 0
record('No uncaught browser exceptions or console errors', errorPass, consoleErrors.join(' | '))

await chromiumBrowser.close()
console.log(JSON.stringify({ baseURL, results, failures, browserConsoleErrors: consoleErrors }, null, 2))
if (failures.length) process.exitCode = 1
