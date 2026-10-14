// @ts-expect-error Node built-ins are used only by Vitest; app TypeScript targets the browser.
import { existsSync, readFileSync } from 'node:fs'
// @ts-expect-error Node built-ins are used only by Vitest; app TypeScript targets the browser.
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const indexHtml = readFileSync(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8')
const logoPath = fileURLToPath(new URL('../../public/smartbob-logo-orange.png', import.meta.url))
const markPath = fileURLToPath(new URL('../../public/smartbob-mark-orange.png', import.meta.url))

describe('smartBOB site branding assets', () => {
  it('sets the smartBOB page title and references the supplied logo as the favicon', () => {
    expect(indexHtml).toContain('<title>smartBOB · Smart Contract Scanner</title>')
    expect(indexHtml).toContain('href="/smartbob-mark-orange.png"')
    expect(existsSync(logoPath)).toBe(true)
    expect(existsSync(markPath)).toBe(true)
  })
})
