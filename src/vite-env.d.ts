/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** Legacy Supabase anon key. Prefer the publishable key when available. */
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** Local loopback API URL; this is a public address, never a credential. */
  readonly VITE_CONTRACTIQ_API_URL?: string
}
