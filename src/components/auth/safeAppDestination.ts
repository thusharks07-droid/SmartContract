const appHome = '/app/dashboard'

export function safeAppDestination(candidate: string | null | undefined): string {
  if (!candidate || !candidate.startsWith('/app/') || candidate.startsWith('//') || candidate.includes('\\')) return appHome
  try {
    const destination = new URL(candidate, window.location.origin)
    if (destination.origin !== window.location.origin || !destination.pathname.startsWith('/app/')) return appHome
    return `${destination.pathname}${destination.search}${destination.hash}`
  } catch {
    return appHome
  }
}
