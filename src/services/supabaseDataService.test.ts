// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
}))

vi.mock('../lib/supabase/client', () => ({
  supabase: { auth: { getUser: supabaseMocks.getUser }, from: supabaseMocks.from },
  supabaseConfiguration: { configured: true, message: null },
}))

import { supabaseDataService } from './supabaseDataService'

function makeScanRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'scan-1', user_id: 'user-1', contract_name: 'Vault', source_filename: 'Vault.sol', source_code: 'contract Vault {}',
    source_hash: null, input_type: 'paste', compiler_version: '0.8.24', status: 'queued', is_demo: false,
    analysis_engine: null, analysis_version: null, options: {}, summary: {}, error_code: null, error_message: null,
    started_at: null, completed_at: null, notes: null, created_at: '2026-10-11T00:00:00.000Z', updated_at: '2026-10-11T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  supabaseMocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
})

describe('Supabase read-only data service', () => {
  it('limits scan listing to the authenticated owner and maps queued rows honestly', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [makeScanRow()], error: null }),
    }
    supabaseMocks.from.mockReturnValue(chain)

    const scans = await supabaseDataService.listScans()

    expect(supabaseMocks.from).toHaveBeenCalledWith('contractiq_scans')
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(scans[0]?.status).toBe('queued')
    expect(scans[0]?.summary).toContain('Analysis has not completed')
  })

  it('does not expose browser scan submission or deletion methods', () => {
    expect(supabaseDataService).not.toHaveProperty('createQueuedSubmission')
    expect(supabaseDataService).not.toHaveProperty('deleteScan')
  })
})
