import type { ContractNode, RelationEdge } from '../types/domain'

// Fixed coordinates are fixture data. The graph view must not run a force layout.
export const demoContractNodes: ContractNode[] = [
  { id: 'vault-contract', scanId: 'demo-scan-2026-014', label: 'Vault', kind: 'contract', file: 'Vault.sol', line: 4, x: 360, y: 70 },
  { id: 'vault-withdraw', scanId: 'demo-scan-2026-014', label: 'withdraw', kind: 'function', file: 'Vault.sol', line: 15, x: 180, y: 210 },
  { id: 'vault-balance', scanId: 'demo-scan-2026-014', label: 'balances[msg.sender]', kind: 'state', file: 'Vault.sol', line: 5, x: 360, y: 350 },
  { id: 'vault-recipient', scanId: 'demo-scan-2026-014', label: 'msg.sender.call', kind: 'external', file: 'Vault.sol', line: 17, x: 550, y: 210 },
  { id: 'vault-set-owner', scanId: 'demo-scan-2026-014', label: 'setOwner', kind: 'function', file: 'Vault.sol', line: 22, x: 180, y: 430 },
  { id: 'vault-owner', scanId: 'demo-scan-2026-014', label: 'owner', kind: 'state', file: 'Vault.sol', line: 6, x: 360, y: 510 },
]

export const demoRelationEdges: RelationEdge[] = [
  { id: 'vault-edge-1', scanId: 'demo-scan-2026-014', source: 'vault-withdraw', target: 'vault-recipient', relation: 'sends', findingId: 'demo-finding-014-001' },
  { id: 'vault-edge-2', scanId: 'demo-scan-2026-014', source: 'vault-withdraw', target: 'vault-balance', relation: 'writes', findingId: 'demo-finding-014-001' },
  { id: 'vault-edge-3', scanId: 'demo-scan-2026-014', source: 'vault-set-owner', target: 'vault-owner', relation: 'writes', findingId: 'demo-finding-014-002' },
  { id: 'vault-edge-4', scanId: 'demo-scan-2026-014', source: 'vault-contract', target: 'vault-withdraw', relation: 'calls' },
]
