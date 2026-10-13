import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

function usable(value: string | undefined): value is string {
  return Boolean(value?.trim() && !value.toUpperCase().includes('YOUR_'))
}

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const publicKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY)?.trim() ?? ''
const validUrl = (() => {
  if (!usable(url)) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
  } catch {
    return false
  }
})()

export const supabaseConfiguration = {
  configured: validUrl && usable(publicKey),
  message: !usable(url)
    ? 'Add VITE_SUPABASE_URL to .env.local to enable account sign-in.'
    : !validUrl
      ? 'VITE_SUPABASE_URL must be a valid HTTPS Supabase URL (localhost is allowed for local development).'
      : !usable(publicKey)
        ? 'Add VITE_SUPABASE_PUBLISHABLE_KEY (or the legacy VITE_SUPABASE_ANON_KEY) to .env.local to enable account sign-in.'
        : null,
}

export const supabase: SupabaseClient<Database> | null = supabaseConfiguration.configured
  ? createClient<Database>(url, publicKey, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
    })
  : null
