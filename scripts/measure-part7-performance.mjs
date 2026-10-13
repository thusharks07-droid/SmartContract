import { chromium } from 'playwright'

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
await page.addInitScript(() => {
  window.__contractIqPerformance = { lcp: null, lcpElement: null, paints: [], longTasks: [] }
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      window.__contractIqPerformance.lcp = entry.startTime
      window.__contractIqPerformance.lcpElement = { tag: entry.element?.tagName, className: entry.element?.className, text: entry.element?.textContent?.trim().slice(0, 90) }
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true })
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) window.__contractIqPerformance.longTasks.push(entry.duration)
  }).observe({ type: 'longtask', buffered: true })
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) window.__contractIqPerformance.paints.push({ name: entry.name, startTime: entry.startTime })
  }).observe({ type: 'paint', buffered: true })
})
const cdp = await page.context().newCDPSession(page)
await cdp.send('Network.enable')
await cdp.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 150,
  downloadThroughput: 200_000,
  uploadThroughput: 93_750,
  connectionType: 'cellular4g',
})
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' })
await page.getByRole('heading', { name: 'Security Overview' }).waitFor()
await page.waitForFunction(() => window.__contractIqPerformance.lcp !== null, { timeout: 15000 }).catch(() => undefined)
await page.waitForTimeout(750)
const metrics = await page.evaluate(() => {
  const resources = performance.getEntriesByType('resource')
  const tasks = window.__contractIqPerformance.longTasks
  return {
    lcpMs: window.__contractIqPerformance.lcp,
    lcpElement: window.__contractIqPerformance.lcpElement,
    paints: window.__contractIqPerformance.paints,
    longTaskCount: tasks.length,
    maxLongTaskMs: tasks.length ? Math.max(...tasks) : 0,
    totalTransferredBytes: resources.reduce((total, entry) => total + entry.transferSize, 0),
    navigation: performance.getEntriesByType('navigation').map((entry) => ({ domContentLoadedMs: entry.domContentLoadedEventEnd, loadMs: entry.loadEventEnd })),
    largestResources: resources.map((entry) => ({ name: new URL(entry.name).pathname, bytes: entry.transferSize })).sort((a, b) => b.bytes - a.bytes).slice(0, 6),
  }
})
console.log(JSON.stringify({ profile: '4G (150ms, 1.6Mbps down) + 4x CPU slowdown', metrics }, null, 2))
await browser.close()
