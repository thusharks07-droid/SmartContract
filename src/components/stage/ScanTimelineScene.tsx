import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useMemo } from 'react'
import { BoxGeometry } from 'three'
import type { Scan } from '../../types/domain'
import { sceneTokens } from './sceneTokens'
import { ScanTimelineFallback } from './ScanTimelineFallback'
import { ScenePostProcessing } from './ScenePostProcessing'
import { useStageAppearance } from './useStageAppearance'
import './scan-timeline.css'

const statusColor: Record<Scan['status'], string> = {
  draft: '#64748b', queued: '#f59e0b', running: '#0ea5e9', completed: '#10b981', failed: '#ef4444', cancelled: '#94a3b8',
}

export interface ScanTimelineSceneProps {
  scans: Scan[]
  onOpenScan: (scan: Scan) => void
}

const ScanPlate = memo(function ScanPlate({ scan, z, geometry, onOpen }: { scan: Scan; z: number; geometry: BoxGeometry; onOpen: () => void }) {
  return <mesh castShadow geometry={geometry} position={[0, 0, z]} onClick={(event) => { event.stopPropagation(); onOpen() }} onPointerOver={() => { document.body.style.cursor = 'pointer' }} onPointerOut={() => { document.body.style.cursor = '' }}>
    <meshStandardMaterial color={statusColor[scan.status]} emissive={statusColor[scan.status]} emissiveIntensity={0.13} metalness={sceneTokens.material.metalness} roughness={sceneTokens.material.roughness} />
  </mesh>
})

/** Static Z-axis chronology. Dates alone determine spacing; no simulated scan activity occurs. */
export const ScanTimelineScene = memo(function ScanTimelineScene({ scans, onOpenScan }: ScanTimelineSceneProps) {
  const { enhanced, lightTheme } = useStageAppearance()
  const ordered = useMemo(() => [...scans].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)), [scans])
  const geometry = useMemo(() => new BoxGeometry(2.1, 0.12, 0.42), [])
  useEffect(() => () => geometry.dispose(), [geometry])
  const timestamps = ordered.map((scan) => Date.parse(scan.submittedAt))
  const first = Math.min(...timestamps)
  const last = Math.max(...timestamps)
  const positionFor = (timestamp: number) => timestamps.length <= 1 || first === last ? 0 : ((timestamp - first) / (last - first) - 0.5) * 8

  return <div className="scan-timeline-scene" data-testid="scan-timeline-scene">
    <div className="scan-timeline-scene__canvas" aria-hidden="true">
      <Canvas shadows={enhanced} camera={{ position: [8, 3.6, 10], fov: sceneTokens.camera.fov }} frameloop="demand" dpr={[1, sceneTokens.performance.maxDevicePixelRatio]} gl={{ antialias: true, powerPreference: 'low-power', alpha: false }}>
        <color attach="background" args={['#f8fafc']} />
        <ambientLight intensity={lightTheme ? 1 : 0.82} />
        <directionalLight castShadow={enhanced} position={[4, 6, 5]} intensity={lightTheme ? 0.82 : 1.1} />
        {ordered.map((scan) => <ScanPlate key={scan.id} scan={scan} z={positionFor(Date.parse(scan.submittedAt))} geometry={geometry} onOpen={() => onOpenScan(scan)} />)}
        <ScenePostProcessing enabled={enhanced} />
      </Canvas>
    </div>
    <ScanTimelineFallback scans={ordered} />
    <p className="scan-timeline-scene__caption">Chronological spacing follows submitted time · illustrative demo records</p>
  </div>
})
