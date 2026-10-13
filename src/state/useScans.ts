import { useSyncExternalStore } from 'react'
import { scanService } from '../services/scanService'

export function useScans() {
  return useSyncExternalStore(scanService.subscribe, scanService.getSnapshot, scanService.getSnapshot)
}
