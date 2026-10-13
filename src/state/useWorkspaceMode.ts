import { useDemoAuth } from './useDemoAuth'
import { useSupabaseAuth } from './useSupabaseAuth'

export type WorkspaceMode = 'demo' | 'account' | 'signed-out'

export function useWorkspaceMode() {
  const demo = useDemoAuth()
  const account = useSupabaseAuth()
  return {
    mode: demo.isAuthenticated ? 'demo' as const : account.session ? 'account' as const : 'signed-out' as const,
    accessToken: account.session?.access_token ?? null,
    accountEmail: account.session?.user.email ?? null,
  }
}
