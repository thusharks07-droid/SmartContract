import { Canvas } from '@react-three/fiber'
import { memo, useEffect, useMemo, useState } from 'react'
import { ExtrudeGeometry, Shape, TorusGeometry } from 'three'
import type { Severity } from '../../types/domain'
import { sceneTokens } from './sceneTokens'
import { ScenePostProcessing } from './ScenePostProcessing'
import { useStageAppearance } from './useStageAppearance'

const severityOrder: Severity[] = ['critical', 'high', 'medium', 'low', 'informational']
const severityColors: Record<Severity, string> = {
  critical: '#f87171',
  high: '#fbbf24',
  medium: '#60a5fa',
  low: '#34d399',
  informational: '#64748b',
}

export interface SeverityOrbitSceneProps {
  counts: Record<Severity, number>
  summaries: Record<Severity, string>
  selected: Severity | null
  onSelect: (severity: Severity | null) => void
  onHover: (severity: Severity | null) => void
}

function createOrbitSegment(start: number, end: number): ExtrudeGeometry {
  const outerRadius = 1.34
  const innerRadius = 0.82
  const shape = new Shape()
  shape.moveTo(outerRadius * Math.cos(start), outerRadius * Math.sin(start))
  shape.absarc(0, 0, outerRadius, start, end, false)
  shape.lineTo(innerRadius * Math.cos(end), innerRadius * Math.sin(end))
  shape.absarc(0, 0, innerRadius, end, start, true)
  shape.closePath()
  return new ExtrudeGeometry(shape, {
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.018,
    bevelThickness: 0.018,
    curveSegments: 24,
    depth: 0.13,
    steps: 1,
  })
}

const OrbitSegment = memo(function OrbitSegment({
  severity,
  start,
  end,
  selected,
  onHover,
  onSelect,
}: {
  severity: Severity
  start: number
  end: number
  selected: boolean
  onHover: (severity: Severity | null) => void
  onSelect: (severity: Severity) => void
}) {
  const geometry = useMemo(() => createOrbitSegment(start, end), [end, start])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh
      geometry={geometry}
      position={[0, 0, 0]}
      scale={selected ? 1.035 : 1}
      onClick={(event) => { event.stopPropagation(); onHover(null); onSelect(severity) }}
      onPointerOver={(event) => { event.stopPropagation(); onHover(severity); document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { onHover(null); document.body.style.cursor = '' }}
    >
      <meshStandardMaterial
        color={severityColors[severity]}
        metalness={sceneTokens.material.metalness}
        roughness={sceneTokens.material.roughness}
        emissive={selected ? severityColors[severity] : '#000000'}
        emissiveIntensity={selected ? 0.12 : 0}
      />
    </mesh>
  )
})

const OrbitGuide = memo(function OrbitGuide() {
  const geometry = useMemo(() => new TorusGeometry(1.51, 0.012, 6, 128), [])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry} position={[0, 0, -0.1]}><meshBasicMaterial color="#cbd5e1" /></mesh>
})

export const SeverityOrbitScene = memo(function SeverityOrbitScene({
  counts,
  summaries,
  selected,
  onSelect,
  onHover,
}: SeverityOrbitSceneProps) {
  const [hovered, setHovered] = useState<Severity | null>(null)
  const { enhanced, lightTheme } = useStageAppearance()
  const total = severityOrder.reduce((sum, severity) => sum + counts[severity], 0)
  const active = selected ?? hovered
  let angle = -Math.PI / 2
  const segments = severityOrder.flatMap((severity) => {
    const count = counts[severity]
    if (count <= 0 || total <= 0) return []
    const start = angle
    angle += (count / total) * Math.PI * 2
    return [{ severity, start, end: angle }]
  })

  function setHoveredSeverity(severity: Severity | null) {
    setHovered(severity)
    onHover(severity)
  }

  return (
    <div className="severity-orbit-scene">
      <div className="severity-orbit-scene__visual">
        <Canvas
          shadows={enhanced}
          aria-label="Severity orbit showing the proportions of illustrative demo findings. Use the severity controls for a text alternative."
          camera={{ position: [0, 0.08, 5.05], fov: sceneTokens.camera.fov }}
          dpr={[1, sceneTokens.performance.maxDevicePixelRatio]}
          frameloop="demand"
          gl={{ antialias: true, powerPreference: 'low-power', alpha: false }}
        >
          <color attach="background" args={['#ffffff']} />
          <ambientLight color={sceneTokens.lighting.ambient} intensity={lightTheme ? 1.05 : 0.9} />
          <directionalLight castShadow={enhanced} color="#ffffff" intensity={lightTheme ? 0.9 : 1.2} position={[2, 3, 5]} />
          <OrbitGuide />
          {segments.map((segment) => (
            <OrbitSegment
              key={segment.severity}
              {...segment}
              selected={active === segment.severity}
              onHover={setHoveredSeverity}
              onSelect={(severity) => onSelect(selected === severity ? null : severity)}
            />
          ))}
          <ScenePostProcessing enabled={enhanced} />
        </Canvas>
        <div aria-live="polite" className="severity-orbit-scene__center" aria-atomic="true">
          <strong>{active ? counts[active] : total}</strong>
          <span>{active ?? 'findings'}</span>
        </div>
        {total === 0 && <p className="severity-orbit-scene__empty">No illustrative records</p>}
      </div>
      <div className="severity-orbit-scene__legend" aria-label="Filter findings by severity">
        {severityOrder.map((severity) => (
          <button
            key={severity}
            aria-pressed={selected === severity}
            className={active === severity ? 'severity-orbit-scene__item severity-orbit-scene__item--active' : 'severity-orbit-scene__item'}
            onClick={() => { setHoveredSeverity(null); onSelect(selected === severity ? null : severity) }}
            onBlur={() => setHoveredSeverity(null)}
            onFocus={() => setHoveredSeverity(severity)}
            onMouseEnter={() => setHoveredSeverity(severity)}
            onMouseLeave={() => setHoveredSeverity(null)}
            type="button"
          >
            <span aria-hidden="true" className="severity-orbit-scene__dot" style={{ backgroundColor: severityColors[severity] }} />
            <span className="severity-orbit-scene__label">{severity}</span>
            <strong>{counts[severity]}</strong>
          </button>
        ))}
      </div>
      <p className="severity-orbit-scene__summary">
        {active ? summaries[active] : `Illustrative — demo data. ${total} finding records across five severity levels.`}
      </p>
    </div>
  )
})
