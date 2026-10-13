import type { Finding, Scan, ScanConfiguration, Severity, VerificationStatus } from '../types/domain'

export const DEMO_VERIFICATION_BANNER = 'DEMO DATA — NO EXPLOIT EXECUTED' as const
export const DEMO_REPORT_NOTICE = 'DEMO DATA — NO REAL SECURITY ANALYSIS RAN' as const

const config: ScanConfiguration = {
  compilerVersion: '0.8.24',
  optimizationEnabled: true,
  optimizationRuns: 200,
  evmVersion: 'Shanghai',
  includeInformational: true,
}

export const seedScans: Scan[] = [
  { id: 'demo-scan-2026-014', contractName: 'Vault', sourceLabel: 'vault-release.zip', submittedAt: '2026-09-18T14:32:00.000Z', updatedAt: '2026-09-18T14:34:12.000Z', status: 'completed', configuration: config, sourceFiles: ['Vault.sol'], inputType: 'upload', summary: 'Demo record contains 3 illustrative findings. No real security analysis ran.' },
  { id: 'demo-scan-2026-013', contractName: 'Treasury', sourceLabel: 'treasury-core.zip', submittedAt: '2026-09-16T09:12:00.000Z', updatedAt: '2026-09-16T09:14:00.000Z', status: 'completed', configuration: { ...config, compilerVersion: '0.8.23' }, sourceFiles: ['Treasury.sol'], inputType: 'upload', summary: 'No findings are recorded in this demo dataset; this is not a security guarantee.' },
  { id: 'demo-scan-2026-012', contractName: 'TokenLedger + Treasury', sourceLabel: 'ledger-v2.zip', submittedAt: '2026-09-14T17:05:00.000Z', updatedAt: '2026-09-14T17:05:00.000Z', status: 'failed', configuration: { ...config, optimizationEnabled: false }, sourceFiles: ['TokenLedger.sol', 'Treasury.sol'], inputType: 'upload', summary: 'Demo record marked failed with a simulated compiler diagnostic.' },
  { id: 'demo-scan-2026-011', contractName: 'Vault', sourceLabel: 'vault-hotfix.zip', submittedAt: '2026-09-12T11:40:00.000Z', updatedAt: '2026-09-12T11:41:30.000Z', status: 'cancelled', configuration: config, sourceFiles: ['Vault.sol'], inputType: 'upload', summary: 'Demo record marked cancelled before a result was recorded.' },
  { id: 'demo-scan-2026-010', contractName: 'Treasury', sourceLabel: 'treasury-review.zip', submittedAt: '2026-09-10T08:22:00.000Z', updatedAt: '2026-09-10T08:22:00.000Z', status: 'queued', configuration: config, sourceFiles: ['Treasury.sol'], inputType: 'upload', summary: 'Queued demo state; no analysis is running.' },
  { id: 'demo-scan-2026-009', contractName: 'TokenLedger', sourceLabel: 'ledger-demo.zip', submittedAt: '2026-09-08T16:18:00.000Z', updatedAt: '2026-09-08T16:18:00.000Z', status: 'running', configuration: { ...config, compilerVersion: '0.8.22' }, sourceFiles: ['TokenLedger.sol'], inputType: 'upload', summary: 'Running demo state; no analysis is running.' },
  { id: 'demo-scan-2026-008', contractName: 'Vault', sourceLabel: 'vault-draft.zip', submittedAt: '2026-09-06T10:00:00.000Z', updatedAt: '2026-09-06T10:00:00.000Z', status: 'draft', configuration: config, sourceFiles: ['Vault.sol'], inputType: 'upload', summary: 'Draft demo record.' },
]

function verification(id: string, findingId: string, status: VerificationStatus, recordedAt: string, note: string) {
  return {
    id, findingId, status, banner: DEMO_VERIFICATION_BANNER, recordedAt, note,
    preconditions: 'Illustrative source fixture loaded in the browser; no chain or external environment is connected.',
    testScenario: 'Static walkthrough of the referenced source lines in this deterministic demo record.',
    expectedBehavior: 'The documented control flow should match the intended contract design after manual review.',
    observedBehavior: 'No execution was performed. This field describes only the seeded demo fixture.',
    stateChanges: 'None recorded; no transaction or state-changing action occurred.',
    executionEnvironment: 'ContractIQ frontend demo · local fixture · no EVM instance',
    evidenceRefs: [findingId],
  }
}

export const seedFindings: Finding[] = [
  {
    id: 'demo-finding-014-001', scanId: 'demo-scan-2026-014', title: 'External call precedes balance update', category: 'Reentrancy', severity: 'critical', confidence: 'high',
    description: 'The demo source sends value before reducing the recorded balance.', impact: 'A reentrant call could observe the prior balance in this illustrative pattern.', recommendation: 'Update internal accounting before transferring control and use an appropriate reentrancy guard.',
    evidence: [{ id: 'demo-evidence-014-001', file: 'Vault.sol', startLine: 17, endLine: 19, excerpt: '        (bool sent, ) = msg.sender.call{value: amount}("");\n        require(sent, "send failed");\n        balances[msg.sender] -= amount;', note: 'External interaction appears before the state update in this source excerpt.' }],
    verification: verification('demo-verification-014-001', 'demo-finding-014-001', 'pending', '2026-09-18T14:34:00.000Z', 'Illustrative status only; no exploit was executed.'),
  },
  {
    id: 'demo-finding-014-002', scanId: 'demo-scan-2026-014', title: 'Owner update has no access check', category: 'Access Control', severity: 'high', confidence: 'high',
    description: 'The demo setter changes the owner without checking the caller.', impact: 'The illustrative function allows any caller to replace the owner value.', recommendation: 'Restrict owner changes to an authorized caller and validate the new address.',
    evidence: [{ id: 'demo-evidence-014-002', file: 'Vault.sol', startLine: 22, endLine: 24, excerpt: '    function setOwner(address nextOwner) external {\n        owner = nextOwner;\n    }', note: 'No authorization condition is present in the shown function.' }],
    verification: verification('demo-verification-014-002', 'demo-finding-014-002', 'verified', '2026-09-18T14:34:02.000Z', 'Source pattern was reviewed in the static demo record; no exploit was executed.'),
  },
  {
    id: 'demo-finding-014-003', scanId: 'demo-scan-2026-014', title: 'External call result checked after interaction', category: 'Unchecked External Call', severity: 'medium', confidence: 'medium',
    description: 'The low-level call result is only checked with a require after control returns.', impact: 'Failure handling and state transition ordering warrant manual review in this example.', recommendation: 'Use an explicit checks-effects-interactions flow and review the external call failure path.',
    evidence: [{ id: 'demo-evidence-014-003', file: 'Vault.sol', startLine: 17, endLine: 18, excerpt: '        (bool sent, ) = msg.sender.call{value: amount}("");\n        require(sent, "send failed");', note: 'The call return value is checked, but the interaction occurs before the balance update.' }],
    verification: verification('demo-verification-014-003', 'demo-finding-014-003', 'not_reproduced', '2026-09-18T14:34:04.000Z', 'A reproduction was not recorded in the demo fixture; no exploit was executed.'),
  },
  {
    id: 'demo-finding-012-001', scanId: 'demo-scan-2026-012', title: 'Allowance decrement follows balance writes', category: 'Unsafe State Transition', severity: 'low', confidence: 'low',
    description: 'The demo record flags the order of state changes for review.', impact: 'Unexpected intermediate state can complicate reasoning about token accounting.', recommendation: 'Review the transition as one atomic accounting operation and retain checked arithmetic.',
    evidence: [{ id: 'demo-evidence-012-001', file: 'TokenLedger.sol', startLine: 15, endLine: 17, excerpt: '        balances[from] -= amount;\n        balances[to] += amount;\n        allowance[from][msg.sender] -= amount;', note: 'The demo reference points to the transfer state updates.' }],
    verification: verification('demo-verification-012-001', 'demo-finding-012-001', 'inconclusive', '2026-09-14T17:04:00.000Z', 'The demo record has no conclusive reproduction evidence.'),
  },
  {
    id: 'demo-finding-012-002', scanId: 'demo-scan-2026-012', title: 'Credit writer lacks role validation', category: 'Access Control', severity: 'informational', confidence: 'medium',
    description: 'The sample credit function does not restrict its caller.', impact: 'This informational demo observation should be reviewed against the intended trust model.', recommendation: 'Document the intended caller set or add an explicit authorization rule.',
    evidence: [{ id: 'demo-evidence-012-002', file: 'Treasury.sol', startLine: 20, endLine: 22, excerpt: '    function recordCredit(address account, uint256 amount) external {\n        credits[account] += amount;\n    }', note: 'No role check is shown in this source excerpt.' }],
    verification: verification('demo-verification-012-002', 'demo-finding-012-002', 'error', '2026-09-14T17:04:30.000Z', 'Verification fixture contains an error state; no exploit was executed.'),
  },
  {
    id: 'demo-finding-011-001', scanId: 'demo-scan-2026-011', title: 'Cancelled record retains an unverified note', category: 'Unsafe State Transition', severity: 'low', confidence: 'low',
    description: 'This illustrative finding remains attached to a cancelled demo record.', impact: 'A cancelled record has no completed review context for this note.', recommendation: 'Review the source and create a fresh demo record if a walkthrough is needed.',
    evidence: [{ id: 'demo-evidence-011-001', file: 'Vault.sol', startLine: 12, endLine: 12, excerpt: '        balances[msg.sender] += msg.value;', note: 'The excerpt is source context for the unverified demo note.' }],
    verification: verification('demo-verification-011-001', 'demo-finding-011-001', 'not_run', '2026-09-12T11:41:00.000Z', 'Verification was not run for this cancelled demo record.'),
  },
]

export const demoSampleSource = `// SAMPLE CONTRACT — illustrative input for the Paste tab only.\n// This source is not analyzed and does not represent a security result.\n// SPDX-License-Identifier: MIT\npragma solidity 0.8.24;\n\ncontract PasteSample {\n    mapping(address => uint256) public balances;\n\n    function deposit() external payable {\n        balances[msg.sender] += msg.value;\n    }\n}\n`

export const severitySeedOrder: Severity[] = ['critical', 'high', 'medium', 'low', 'informational']
