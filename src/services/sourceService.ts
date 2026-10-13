import pasteSample from '../data/samples/PasteSample.sol?raw'
import tokenLedger from '../data/samples/TokenLedger.sol?raw'
import treasury from '../data/samples/Treasury.sol?raw'
import vault from '../data/samples/Vault.sol?raw'

const sources = new Map<string, string>([
  ['Vault.sol', vault],
  ['Treasury.sol', treasury],
  ['TokenLedger.sol', tokenLedger],
  ['PasteSample.sol', pasteSample],
])
const scanSources = new Map<string, Map<string, string>>()

export const sourceService = {
  listFiles(): string[] { return [...sources.keys()] },
  get(fileName: string, scanId?: string): string | undefined { return (scanId ? scanSources.get(scanId)?.get(fileName) : undefined) ?? sources.get(fileName) },
  registerScanSource(scanId: string, fileName: string, source: string): void {
    const files = scanSources.get(scanId) ?? new Map<string, string>()
    files.set(fileName, source)
    scanSources.set(scanId, files)
  },
  copyScanSources(sourceScanId: string, targetScanId: string, fileNames: string[]): void {
    const sourceFiles = scanSources.get(sourceScanId)
    if (!sourceFiles) return
    scanSources.set(targetScanId, new Map(fileNames.flatMap((fileName) => {
      const source = sourceFiles.get(fileName)
      return source === undefined ? [] : [[fileName, source] as const]
    })))
  },
  removeScanSources(scanId: string): void { scanSources.delete(scanId) },
  getPasteSample(): string { return pasteSample },
}
