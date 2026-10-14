// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { settingsService } from './settingsService'

beforeEach(() => window.localStorage.clear())

describe('smartBOB workspace branding settings', () => {
  it('uses the smartBOB demo name by default', () => {
    expect(settingsService.get().workspaceName).toBe('smartBOB Demo')
    expect(settingsService.get().theme).toBe('light')
    expect(settingsService.get().aiProvider).toBe('automatic')
  })

  it('migrates the previous default name and preserves a custom workspace name', () => {
    window.localStorage.setItem('contractiq.settings', JSON.stringify({ workspaceName: 'ContractIQ Demo' }))
    expect(settingsService.get().workspaceName).toBe('smartBOB Demo')

    window.localStorage.setItem('contractiq.settings', JSON.stringify({ workspaceName: 'My Audit Workspace' }))
    expect(settingsService.get().workspaceName).toBe('My Audit Workspace')
  })
})
