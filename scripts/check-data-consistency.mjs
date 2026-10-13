import { createServer } from 'vite'

const server = await createServer({ configFile: './vite.config.ts', server: { middlewareMode: true }, appType: 'custom' })
try {
  const { checkDataConsistency } = await server.ssrLoadModule('/src/services/consistencyCheck.ts')
  const { scanService } = await server.ssrLoadModule('/src/services/scanService.ts')
  const result = checkDataConsistency()
  const created = scanService.createDemoScan({ contractName: 'LifecycleDemo', sourceLabel: 'lifecycle-demo.sol', sourceFiles: ['lifecycle-demo.sol'] })
  checkDataConsistency()
  scanService.updateStatus(created.id, 'queued')
  checkDataConsistency()
  if (!scanService.deleteDemoRecord(created.id)) throw new Error('Could not delete local demo record during consistency check')
  checkDataConsistency()
  result.checks.push('Create, status update, and delete preserve dashboard/history/report consistency')
  console.log(JSON.stringify(result, null, 2))
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await server.close()
}
