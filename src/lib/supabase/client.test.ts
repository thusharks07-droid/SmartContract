import { afterEach, describe, expect, it, vi } from 'vitest'

const supabaseMocks = vi.hoisted(() => ({ createClient: vi.fn(() => ({ client: true })) }))

vi.mock('@supabase/supabase-js', () => ({ createClient: supabaseMocks.createClient }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  supabaseMocks.createClient.mockClear()
})

describe('Supabase browser configuration', () => {
  it('uses the legacy anon key when the publishable key is blank', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '   ')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'legacy-public-key')

    const { supabase, supabaseConfiguration } = await import('./client')

    expect(supabaseConfiguration.configured).toBe(true)
    expect(supabaseMocks.createClient).toHaveBeenCalledWith(
      'https://project.supabase.co',
      'legacy-public-key',
      expect.objectContaining({ auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true } }),
    )
    expect(supabase).toEqual({ client: true })
  })

  it('rejects placeholder keys instead of treating them as configured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'YOUR_SUPABASE_PUBLISHABLE_KEY')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')

    const { supabase, supabaseConfiguration } = await import('./client')

    expect(supabaseConfiguration.configured).toBe(false)
    expect(supabase).toBeNull()
    expect(supabaseMocks.createClient).not.toHaveBeenCalled()
  })
})
