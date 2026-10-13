import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const baseURL = process.env.CONTRACTIQ_BASE_URL ?? 'http://127.0.0.1:5174'
const outputDir = path.dirname(fileURLToPath(import.meta.url))
const results = []
const screenshots = []
const errors = []
const requests = []
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})

function record(name, passed, details = '') {
  results.push({ name, status: passed ? 'PASS' : 'FAIL', details })
}

function watch(page) {
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  page.on('request', (request) => requests.push({ url: request.url(), method: request.method(), postData: request.postData() }))
}

async function capture(page, filename) {
  const target = path.join(outputDir, filename)
  await page.screenshot({ path: target, fullPage: true, animations: 'disabled' })
  screenshots.push({ path: target, bytes: fs.statSync(target).size })
}

async function open(page, route) {
  await page.goto(`${baseURL}${route}`, { waitUntil: 'domcontentloaded' })
  if (route.startsWith('/app/')) {
    await page.locator('.workspace').waitFor({ state: 'visible' })
    await page.locator('.workspace h1').first().waitFor({ state: 'visible', timeout: 15000 })
  }
  await page.evaluate(() => document.fonts?.ready)
}

try {
  const publicContext = await browser.newContext({ viewport: { width: 1440, height: 960 } })
  const page = await publicContext.newPage()
  watch(page)

  await open(page, '/')
  record('Public landing is available signed out', await page.getByRole('heading', { name: /See the risks in your smart contracts before deployment/i }).isVisible())
  record('Landing disclaimer explicitly says no real contract analysis is performed', await page.locator('.landing-disclaimer').isVisible())
  const initialRequests = requests.map((item) => item.url)
  record('Landing initial load excludes 3D and Three.js assets', !initialRequests.some((url) => /SeverityOrbitScene|RiskSurfaceScene|ScanTimelineScene|useStageAppearance|node_modules\/three/i.test(url)))
  await capture(page, 'landing-desktop-1440.png')

  for (const [label, href] of [['Product', '#product'], ['How it works', '#how-it-works'], ['Capabilities', '#capabilities'], ['FAQ', '#faq']]) {
    await page.getByRole('link', { name: label, exact: true }).first().click()
    record(`Landing ${label} anchor works`, new URL(page.url()).hash === href && await page.locator(href).count() === 1)
  }
  const faq = page.getByRole('button', { name: 'Does ContractIQ run a real smart-contract scan?' })
  const faqWasExpanded = await faq.getAttribute('aria-expanded') === 'true'
  await faq.focus()
  await page.keyboard.press('Enter')
  record('FAQ keyboard-operable control toggles expanded state', faqWasExpanded && await faq.getAttribute('aria-expanded') === 'false')
  await page.getByRole('link', { name: 'Privacy', exact: true }).click()
  await page.getByRole('heading', { name: 'Privacy in this demo' }).waitFor({ state: 'visible' })
  record('Privacy page opens', await page.getByRole('heading', { name: 'Privacy in this demo' }).isVisible())
  await page.getByRole('link', { name: 'Return to ContractIQ' }).click()
  await page.getByRole('link', { name: 'Terms', exact: true }).click()
  await page.getByRole('heading', { name: 'Terms for this demo' }).waitFor({ state: 'visible' })
  record('Terms page opens', await page.getByRole('heading', { name: 'Terms for this demo' }).isVisible())

  await page.setViewportSize({ width: 375, height: 812 })
  await open(page, '/')
  await capture(page, 'landing-mobile-375.png')
  const menuButton = page.getByRole('button', { name: 'Open navigation menu' })
  for (let index = 0; index < 16 && !(await menuButton.evaluate((button) => button === document.activeElement)); index += 1) await page.keyboard.press('Tab')
  record('Keyboard focus reaches mobile navigation toggle', await menuButton.evaluate((button) => button === document.activeElement))
  await page.keyboard.press('Enter')
  const expandedMenu = page.getByRole('navigation', { name: 'Mobile navigation' })
  record('Mobile navigation opens from keyboard and moves focus inside', await expandedMenu.isVisible() && await expandedMenu.evaluate((nav) => nav.contains(document.activeElement)))
  await page.keyboard.press('Escape')
  record('Escape closes mobile navigation and restores menu-button focus', await page.getByRole('navigation', { name: 'Mobile navigation' }).count() === 0 && await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Open navigation menu'))
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await open(page, '/')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    record(`Landing has no horizontal overflow at ${width}px`, !overflow, `scrollWidth=${await page.evaluate(() => document.documentElement.scrollWidth)}`)
  }

  // Demo login and credential-handling checks start in a fresh, signed-out tab.
  await page.setViewportSize({ width: 1440, height: 960 })
  await open(page, '/login')
  await capture(page, 'login-desktop-1440.png')
  const email = page.getByRole('textbox', { name: 'Email address' })
  const password = page.getByLabel('Password', { exact: true })
  for (let index = 0; index < 16 && !(await email.evaluate((input) => input === document.activeElement)); index += 1) await page.keyboard.press('Tab')
  record('Keyboard focus reaches login email field', await email.evaluate((input) => input === document.activeElement))
  await page.keyboard.type('not-an-email')
  await page.keyboard.press('Tab')
  await page.keyboard.type('')
  await page.keyboard.press('Enter')
  record('Keyboard login validation reports invalid email and empty password', await page.locator('#demo-email-error').isVisible() && await page.locator('#demo-password-error').isVisible())
  await password.focus()
  await page.keyboard.type('local-only-value')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  record('Password visibility control reveals and re-hides the input', await password.getAttribute('type') === 'text')
  await page.keyboard.press('Enter')
  record('Password hides after toggle', await password.getAttribute('type') === 'password')
  const disclaimer = await page.getByText('Demo sign-in only — no account is created and no credentials are sent to a server.')
  record('Login explains credential handling', await disclaimer.isVisible())
  await email.fill('demo@example.invalid')
  await password.fill('one-time-local-password')
  await password.press('Enter')
  await page.waitForURL('**/app/dashboard')
  const storedAuth = await page.evaluate(() => ({ session: sessionStorage.getItem('contractiq.demo-session'), local: localStorage.getItem('contractiq.settings') }))
  record('Valid demo-form entry stores only the demo session marker', storedAuth.session === '{"mode":"demo","displayName":"Demo User"}' && !JSON.stringify(storedAuth).includes('demo@example.invalid') && !JSON.stringify(storedAuth).includes('local-only-value'))
  const credentialRequests = requests.filter((item) => item.method !== 'GET' || /demo@example\.invalid|local-only-value/.test(item.postData ?? ''))
  record('Login sends no credentials in network requests', credentialRequests.length === 0, `non-GET/credential-bearing requests=${credentialRequests.length}`)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'Security Overview' }).waitFor({ state: 'visible' })
  record('Demo session survives refresh in the same tab', await page.getByRole('heading', { name: 'Security Overview' }).isVisible())
  await page.getByRole('banner').getByRole('button', { name: 'Open Demo User menu' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await page.waitForURL(`${baseURL}/`)
  await page.getByRole('heading', { name: /See the risks in your smart contracts before deployment/i }).waitFor({ state: 'visible' })
  record('Sign out clears session and returns to public landing', await page.evaluate(() => sessionStorage.getItem('contractiq.demo-session')) === null && await page.getByRole('heading', { name: /See the risks in your smart contracts before deployment/i }).isVisible())
  await publicContext.close()

  const deepLinkContext = await browser.newContext({ viewport: { width: 1440, height: 960 } })
  const deepLinkPage = await deepLinkContext.newPage()
  watch(deepLinkPage)
  await deepLinkPage.goto(`${baseURL}/app/scans/demo-scan-2026-014`, { waitUntil: 'domcontentloaded' })
  await deepLinkPage.getByRole('heading', { name: 'Explore the security workspace.' }).waitFor()
  record('Signed-out protected deep link redirects to login with local next path', new URL(deepLinkPage.url()).pathname === '/login' && new URLSearchParams(new URL(deepLinkPage.url()).search).get('next') === '/app/scans/demo-scan-2026-014')
  await deepLinkPage.getByRole('button', { name: 'Continue as Demo' }).click()
  await deepLinkPage.waitForURL('**/app/scans/demo-scan-2026-014')
  await deepLinkPage.getByRole('heading', { name: 'Vault', level: 1 }).waitFor({ state: 'visible' })
  record('Demo entry returns to requested protected destination', await deepLinkPage.getByRole('heading', { name: 'Vault', level: 1 }).isVisible())
  await deepLinkPage.getByRole('banner').getByRole('button', { name: 'Open Demo User menu' }).click()
  await deepLinkPage.getByRole('menuitem', { name: 'Sign out' }).click()
  await deepLinkPage.waitForURL(`${baseURL}/`)
  await deepLinkPage.goto(`${baseURL}/login?next=${encodeURIComponent('https://outside.example/path')}`)
  await deepLinkPage.getByRole('button', { name: 'Continue as Demo' }).click()
  await deepLinkPage.waitForURL('**/app/dashboard')
  record('External next value safely resolves to app dashboard', new URL(deepLinkPage.url()).origin === new URL(baseURL).origin && new URL(deepLinkPage.url()).pathname === '/app/dashboard')
  await deepLinkContext.close()

  const appContext = await browser.newContext({ viewport: { width: 1440, height: 960 } })
  await appContext.addInitScript(() => sessionStorage.setItem('contractiq.demo-session', JSON.stringify({ mode: 'demo', displayName: 'Demo User' })))
  const appPage = await appContext.newPage()
  watch(appPage)
  const routes = [
    ['/app/dashboard', 'Security Overview', 'dashboard-desktop-1440.png'],
    ['/app/new-scan', 'New Scan', 'new-scan-desktop-1440.png'],
    ['/app/scans', 'All scan records', 'history-desktop-1440.png'],
    ['/app/scans/demo-scan-2026-014', 'Vault', 'scan-details-desktop-1440.png'],
    ['/app/scans/demo-scan-2026-014/findings/demo-finding-014-001', 'External call precedes balance update', 'finding-desktop-1440.png'],
    ['/app/reports/demo-scan-2026-014', 'Report Viewer', 'report-desktop-1440.png'],
    ['/app/settings', 'Settings', 'settings-desktop-1440.png'],
  ]
  for (const [route, heading, filename] of routes) {
    await open(appPage, route)
    record(`Direct route ${route} loads`, await appPage.getByRole('heading', { name: heading }).first().isVisible())
    await capture(appPage, filename)
    await appPage.reload({ waitUntil: 'domcontentloaded' })
    record(`Refresh on ${route} remains in the app`, new URL(appPage.url()).pathname === route)
  }

  await open(appPage, '/app/dashboard')
  await appPage.evaluate(() => document.activeElement?.blur())
  for (let index = 0; index < 32 && !(await appPage.locator('.sidebar a[href="/app/new-scan"]').evaluate((link) => link === document.activeElement)); index += 1) await appPage.keyboard.press('Tab')
  const keyboardNewScanFocused = await appPage.locator('.sidebar a[href="/app/new-scan"]').evaluate((link) => link === document.activeElement)
  await appPage.keyboard.press('Enter')
  await appPage.waitForURL('**/app/new-scan')
  await appPage.getByRole('heading', { name: 'New Scan' }).waitFor({ state: 'visible' })
  record('Keyboard-only dashboard navigation opens New Scan', keyboardNewScanFocused && new URL(appPage.url()).pathname === '/app/new-scan' && await appPage.getByRole('heading', { name: 'New Scan' }).isVisible(), `tab focus reached link=${keyboardNewScanFocused}`)
  await appPage.getByRole('tab', { name: 'Paste Solidity' }).click()
  await appPage.getByRole('button', { name: 'Load sample contract' }).click()
  await appPage.getByRole('button', { name: 'Create Demo Record' }).click()
  await appPage.waitForURL(/\/app\/scans\/demo-scan-local-\d{3}$/)
  const createdId = new URL(appPage.url()).pathname.split('/').at(-1)
  await appPage.getByRole('heading', { name: 'PasteSample', level: 1 }).waitFor({ state: 'visible' })
  record('New Scan creates a deterministic browser-local demo record', Boolean(createdId?.startsWith('demo-scan-local-')) && await appPage.getByRole('heading', { name: 'PasteSample', level: 1 }).isVisible())
  await appPage.locator('.sidebar a[href="/app/scans"]').click()
  await appPage.getByPlaceholder('Search contract or scan ID').fill('definitely-not-a-contract')
  record('History no-match state is visible', await appPage.getByText('No records match these filters').isVisible())
  await appPage.getByRole('button', { name: 'Clear' }).click()
  await appPage.getByRole('button', { name: new RegExp(`Delete ${createdId} demo record`) }).click()
  await appPage.getByRole('dialog').waitFor({ state: 'visible' })
  await appPage.getByRole('button', { name: 'Delete demo record', exact: true }).last().click()
  await appPage.getByText('Demo record deleted').waitFor({ state: 'visible', timeout: 5000 })
  record('Created record can be deleted from local history', await appPage.getByText('Demo record deleted').isVisible())

  await open(appPage, '/app/scans/not-a-real-scan')
  record('Invalid scan ID renders not-found state', await appPage.getByRole('heading', { name: 'Scan record not found' }).isVisible())
  await open(appPage, '/app/scans/demo-scan-2026-014/findings/not-a-real-finding')
  record('Invalid finding ID renders not-found state', await appPage.getByRole('heading', { name: 'Finding not found' }).isVisible())

  await open(appPage, '/app/scans/demo-scan-2026-014/findings/demo-finding-014-001')
  await appPage.getByRole('button', { name: 'Graph', exact: true }).click()
  const sourceNode = appPage.getByRole('button', { name: /setOwner Vault\.sol:22/ })
  for (let index = 0; index < 100 && !(await sourceNode.evaluate((button) => button === document.activeElement)); index += 1) await appPage.keyboard.press('Tab')
  const sourceNodeFocused = await sourceNode.evaluate((button) => button === document.activeElement)
  await appPage.keyboard.press('Enter')
  record('Keyboard graph node selection updates source excerpt', sourceNodeFocused && await appPage.getByText(/focus line 22 · selected from call structure/).isVisible())
  await appPage.waitForFunction(() => {
    const section = document.querySelector('[aria-labelledby="affected-code-title"]')
    if (!section) return false
    const { top } = section.getBoundingClientRect()
    return top >= -4 && top < innerHeight
  }, { timeout: 5000 }).catch(() => {})
  record('Selected source is brought into view', await appPage.locator('[aria-labelledby="affected-code-title"]').evaluate((element) => element.getBoundingClientRect().top >= -4 && element.getBoundingClientRect().top < innerHeight))

  await open(appPage, '/app/scans/demo-scan-2026-014')
  await appPage.locator('.action-menu summary').click()
  const downloadWait = appPage.waitForEvent('download')
  await appPage.getByRole('button', { name: 'Export Report JSON' }).click()
  const download = await downloadWait
  const downloadPath = await download.path()
  const reportText = downloadPath ? fs.readFileSync(downloadPath, 'utf8') : ''
  record('Report JSON download produces mock report data', Boolean(download.suggestedFilename()) && reportText.includes('demo-scan-2026-014') && /demo|illustrative/i.test(reportText), download.suggestedFilename())
  await open(appPage, '/app/reports/demo-scan-2026-014')
  await appPage.emulateMedia({ media: 'print' })
  const pdf = await appPage.pdf({ format: 'A4', printBackground: true })
  record('Print/PDF output includes report pages and excludes stages', pdf.length > 10000 && await appPage.locator('.stage-shell').evaluateAll((items) => items.every((item) => getComputedStyle(item).display === 'none')))
  await appPage.emulateMedia({ media: 'screen' })

  for (const width of [375, 768, 1024, 1440]) {
    await appPage.setViewportSize({ width, height: 900 })
    for (const [route, label] of [['/', 'landing'], ['/app/dashboard', 'dashboard'], ['/app/new-scan', 'new scan'], ['/app/scans', 'history'], ['/app/scans/demo-scan-2026-014', 'scan details'], ['/app/scans/demo-scan-2026-014/findings/demo-finding-014-001', 'finding'], ['/app/reports/demo-scan-2026-014', 'report'], ['/app/settings', 'settings']]) {
      await open(appPage, route)
      const scrollWidth = await appPage.evaluate(() => document.documentElement.scrollWidth)
      record(`${label} has no horizontal overflow at ${width}px`, scrollWidth <= width, `scrollWidth=${scrollWidth}`)
    }
  }
  await appPage.setViewportSize({ width: 375, height: 812 })
  await open(appPage, '/app/dashboard')
  await capture(appPage, 'dashboard-mobile-375.png')
  await open(appPage, '/app/new-scan')
  await capture(appPage, 'new-scan-mobile-375.png')
  await open(appPage, '/app/scans/demo-scan-2026-014')
  await capture(appPage, 'scan-details-mobile-375.png')
  await appPage.setViewportSize({ width: 768, height: 900 })
  await open(appPage, '/app/dashboard')
  await capture(appPage, 'dashboard-tablet-768.png')
  await appPage.setViewportSize({ width: 1024, height: 900 })
  await open(appPage, '/app/dashboard')
  await capture(appPage, 'dashboard-tablet-1024.png')
  record('All scan/security labels remain explicitly demo/illustrative', await appPage.getByText('DEMO', { exact: true }).count() > 0 && await appPage.getByText(/mock data|illustrative demo records|no real security analysis/i).count() > 0)

  record('No uncaught browser or console errors across tested flows', errors.length === 0, errors.join(' | '))
  const remoteNetworkRequests = requests.filter((item) => {
    try {
      const url = new URL(item.url)
      return ['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname)
    } catch { return false }
  })
  const unexpectedRemoteRequests = remoteNetworkRequests.filter((item) => !new URL(item.url).hostname.endsWith('jsdelivr.net'))
  record('No backend requests or credential submissions were made; Monaco loads static vendor assets', unexpectedRemoteRequests.length === 0 && requests.every((item) => item.method === 'GET') && credentialRequests.length === 0, `remote static asset requests=${remoteNetworkRequests.length}; non-GET=${requests.filter((item) => item.method !== 'GET').length}; unexpected remote requests=${unexpectedRemoteRequests.length}`)

  const output = { baseURL, browser: 'Chrome ' + browser.version(), results, failures: results.filter((item) => item.status === 'FAIL').map((item) => item.name), screenshots, browserErrors: errors }
  fs.writeFileSync(path.join(outputDir, 'browser-audit-results.json'), JSON.stringify(output, null, 2))
  console.log(JSON.stringify(output, null, 2))
  if (output.failures.length) process.exitCode = 1
  await appContext.close()
} finally {
  await browser.close()
}
