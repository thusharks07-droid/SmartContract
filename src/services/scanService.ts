import { seedScans } from '../data/mockData'
import type { Scan, ScanConfiguration, ScanStatus } from '../types/domain'
import { sourceService } from './sourceService'

type ScanListener = () => void
const scans: Scan[] = seedScans.map((scan) => ({ ...scan, configuration: { ...scan.configuration }, sourceFiles: [...scan.sourceFiles] }))
const listeners = new Set<ScanListener>()
let createdScanIndex = 1
let snapshot = cloneScans()

function cloneScans(): Scan[] {
  return scans.map((scan) => ({ ...scan, configuration: { ...scan.configuration }, sourceFiles: [...scan.sourceFiles] }))
}

function notify() {
  snapshot = cloneScans()
  listeners.forEach((listener) => listener())
}

export const scanService = {
  list(): Scan[] {
    return cloneScans()
  },

  getSnapshot(): Scan[] {
    return snapshot
  },

  get(scanId: string): Scan | undefined {
    const scan = scans.find((item) => item.id === scanId)
    return scan ? { ...scan, configuration: { ...scan.configuration }, sourceFiles: [...scan.sourceFiles] } : undefined
  },

  createDemoScan(input: { contractName: string; sourceLabel: string; sourceFiles: string[]; inputType?: 'upload' | 'paste'; notes?: string; configuration?: Partial<ScanConfiguration> }): Scan {
    const id = `demo-scan-local-${String(createdScanIndex).padStart(3, '0')}`
    const timestamp = new Date(Date.UTC(2026, 8, 20, 12, createdScanIndex)).toISOString()
    createdScanIndex += 1
    const scan: Scan = {
      id,
      contractName: input.contractName,
      sourceLabel: input.sourceLabel,
      submittedAt: timestamp,
      updatedAt: timestamp,
      status: 'draft',
      configuration: {
        compilerVersion: input.configuration?.compilerVersion ?? '0.8.24',
        optimizationEnabled: input.configuration?.optimizationEnabled ?? true,
        optimizationRuns: input.configuration?.optimizationRuns ?? 200,
        evmVersion: input.configuration?.evmVersion ?? 'Shanghai',
        includeInformational: input.configuration?.includeInformational ?? true,
        analysisOptions: input.configuration?.analysisOptions ?? { reentrancy: true, accessControl: true, staticAnalysis: true },
      },
      sourceFiles: [...input.sourceFiles],
      inputType: input.inputType ?? 'upload',
      notes: input.notes,
      summary: 'Local draft demo record. No scanner was invoked and no analysis ran.',
    }
    scans.unshift(scan)
    notify()
    return this.get(id)!
  },

  updateStatus(scanId: string, status: ScanStatus): Scan | undefined {
    const scan = scans.find((item) => item.id === scanId)
    if (!scan) return undefined
    scan.status = status
    scan.updatedAt = new Date(Date.parse(scan.submittedAt) + 60_000).toISOString()
    scan.summary = status === 'completed'
      ? 'Status updated in the local demo record. No real security analysis ran.'
      : `Status updated to ${status} in the local demo record. No scanner was invoked.`
    notify()
    return this.get(scanId)
  },

  deleteDemoRecord(scanId: string): boolean {
    const index = scans.findIndex((scan) => scan.id === scanId)
    if (index < 0) return false
    scans.splice(index, 1)
    sourceService.removeScanSources(scanId)
    notify()
    return true
  },

  subscribe(listener: ScanListener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
