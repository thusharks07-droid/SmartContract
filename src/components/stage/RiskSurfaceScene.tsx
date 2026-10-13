import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useMemo } from 'react'
import { BoxGeometry } from 'three'
import type { Finding, Severity } from '../../types/domain'
import { sceneTokens } from './sceneTokens'
import { RiskFindingList } from './RiskSurfaceFallback'
import { ScenePostProcessing } from './ScenePostProcessing'
import { useStageAppearance } from './useStageAppearance'
import './risk-surface.css'

const severityRank: Record<Severity, number> = { critical: 5, high: 4, medium: 3, low: 2, informational: 1 }
const severityColor: Record<Severity, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#3b82f6', informational: '#64748b',
}

export interface RiskSurfaceSceneProps {
  findings: Finding[]
  selectedFindingId: string | null
  onSelectFinding: (finding: Finding) => void
}

const RiskColumn = memo(function RiskColumn({ finding, index, total, selected, onSelect }: {
  finding: Finding; index: number; total: number; selected: boolean; onSelect: () => void
}) {
  const geometry = useMemo(() => new BoxGeometry(0.74, 1, 0.7), [])
  useEffect(() => () => geometry.dispose(), [geometry])
  const height = severityRank[finding.severity] * 0.48 + 0.42
  const spacing = Math.min(1.08, 7.8 / Math.max(total, 1))
  const x = (index - (total - 1) / 2) * spacing
  return <mesh castShadow geometry={geometry} position={[x, height / 2 - 1.25, 0]} scale={[1, height, 1]} onClick={(event) => { event.stopPropagation(); onSelect() }} onPointerOver={() => { document.body.style.cursor = 'pointer' }} onPointerOut={() => { document.body.style.cursor = '' }}>
    <meshStandardMaterial color={severityColor[finding.severity]} emissive={severityColor[finding.severity]} emissiveIntensity={selected ? 0.24 : 0.04} roughness={sceneTokens.material.roughness} metalness={sceneTokens.material.metalness} />
  </mesh>
})

/** Static, pre-sized severity columns. All navigation controls remain in the DOM listbox. */
export const RiskSurfaceScene = memo(function RiskSurfaceScene({ findings, selectedFindingId, onSelectFinding }: RiskSurfaceSceneProps) {
  const { enhanced, lightTheme } = useStageAppearance()
  return <div className="risk-surface" data-testid="risk-surface-scene">
    <div className="risk-surface__canvas" aria-hidden="true">
      <Canvas shadows={enhanced} camera={{ position: [0, 1.75, 6.8], fov: sceneTokens.camera.fov }} frameloop="demand" dpr={[1, sceneTokens.performance.maxDevicePixelRatio]} gl={{ antialias: true, powerPreference: 'low-power', alpha: false }}>
        <color attach="background" args={['#f8fafc']} />
        <ambientLight intensity={lightTheme ? 1.05 : 0.9} />
        <directionalLight castShadow={enhanced} position={[3, 6, 5]} intensity={lightTheme ? 0.8 : 1.1} />
        {findings.map((finding, index) => <RiskColumn key={finding.id} finding={finding} index={index} total={findings.length} selected={finding.id === selectedFindingId} onSelect={() => onSelectFinding(finding)} />)}
        <ScenePostProcessing enabled={enhanced} />
      </Canvas>
    </div>
    <RiskFindingList findings={findings} selectedFindingId={selectedFindingId} onSelectFinding={onSelectFinding} />
    <p className="risk-surface__note">Illustrative severity profile · demo data only</p>
  </div>
})
