import { chromium } from 'playwright'

const baseURL = process.env.CONTRACTIQ_BASE_URL ?? 'http://127.0.0.1:5174'
const chromiumBrowser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
})
const context = await chromiumBrowser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
await context.addInitScript(() => sessionStorage.setItem('contractiq.demo-session', JSON.stringify({ mode: 'demo', displayName: 'Demo User' })))
const page = await context.newPage()
const failures = []
const widths = [320, 375, 390, 768, 1024, 1440]
const routes = [
  '/', '/login', '/privacy', '/terms', '/app/dashboard', '/app/new-scan', '/app/scans',
  '/app/scans/demo-scan-2026-014', '/app/scans/demo-scan-2026-014/findings/demo-finding-014-001',
  '/app/reports/demo-scan-2026-014', '/app/settings',
]

for (const width of widths) {
  await page.setViewportSize({ width, height: 844 })
  for (const route of routes) {
    await page.goto(`${baseURL}${route}`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction((expectedPath) => location.pathname === expectedPath, route)
    await page.locator('h1').first().waitFor({ state: 'visible' })
    await page.waitForTimeout(100)
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }))
    if (dimensions.document > dimensions.viewport) failures.push(`${width}px ${route} overflows to ${dimensions.document}px`)
  }
}

await page.setViewportSize({ width: 390, height: 844 })
await page.goto(`${baseURL}/app/dashboard`, { waitUntil: 'domcontentloaded' })
const appMenuButton = page.getByRole('button', { name: 'Open navigation menu' })
await appMenuButton.click()
if (await appMenuButton.getAttribute('aria-expanded') !== 'true') failures.push('App navigation button does not expose its expanded state')
if (await page.locator('#app-navigation').getAttribute('aria-hidden') !== 'false') failures.push('App navigation drawer did not open')
await page.locator('#app-navigation a[href], #app-navigation button:not([disabled])').last().focus()
await page.keyboard.press('Tab')
if (await page.evaluate(() => document.activeElement?.getAttribute('href')) !== '/app/dashboard') failures.push('Tab did not wrap inside the open app navigation drawer')
await page.keyboard.press('Escape')
if (await page.locator('#app-navigation').getAttribute('aria-hidden') !== 'true') failures.push('Escape did not close the app navigation drawer')
if (await page.evaluate(() => document.activeElement?.getAttribute('aria-label')) !== 'Open navigation menu') failures.push('Closing the app drawer did not restore keyboard focus')
await appMenuButton.click()
await page.locator('#app-navigation a[href="/app/scans"]').click()
if (!page.url().endsWith('/app/scans') || await page.locator('#app-navigation').getAttribute('aria-hidden') !== 'true') failures.push('App navigation did not close after route navigation')

await page.goto(`${baseURL}/`, { waitUntil: 'domcontentloaded' })
const landingMenuButton = page.getByRole('button', { name: 'Open navigation menu' })
await landingMenuButton.click()
if (await page.getByRole('navigation', { name: 'Mobile navigation' }).count() !== 1) failures.push('Landing mobile navigation did not open')
await page.keyboard.press('Escape')
if (await page.getByRole('navigation', { name: 'Mobile navigation' }).count() !== 0) failures.push('Escape did not close landing navigation')
if (await page.evaluate(() => document.activeElement?.getAttribute('aria-label')) !== 'Open navigation menu') failures.push('Closing the landing menu did not restore keyboard focus')

await page.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded' })
await page.getByRole('button', { name: 'Need an account? Create one' }).click()
if (!(await page.getByRole('heading', { name: 'Create an account' }).isVisible())) failures.push('Registration form did not open from the login route')
if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) failures.push('Registration form overflows at 390px')

await page.goto(`${baseURL}/app/new-scan`, { waitUntil: 'domcontentloaded' })
await page.getByRole('heading', { name: 'New Scan' }).waitFor({ state: 'visible' })
await page.getByRole('button', { name: 'Advanced settings' }).click()
await page.locator('.advanced-fields').waitFor({ state: 'visible' })
const mobileTargets = await page.evaluate(() => ['.topbar__mobile-menu', '.nav-link', '.source-tab', '.form-field input', '.form-field select']
  .map((selector) => {
    const element = document.querySelector(selector)
    const rect = element?.getBoundingClientRect()
    return { selector, height: rect?.height ?? 0, width: rect?.width ?? 0 }
  }))
for (const target of mobileTargets) {
  if (!target.height || target.height < 44) failures.push(`${target.selector} touch target is ${target.width}×${target.height}px at 390px`)
}

await context.close()
await chromiumBrowser.close()
console.log(JSON.stringify({ baseURL, viewportWidths: widths, routesChecked: routes.length, checks: widths.length * routes.length + 14, failures }, null, 2))
if (failures.length) process.exitCode = 1
