import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { BufferGeometry, CylinderGeometry, SphereGeometry, Vector3 } from 'three'
import { OrbitControls as ThreeOrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { ContractNode, RelationEdge, Severity } from '../../types/domain'
import { sceneTokens } from './sceneTokens'
import { ScenePostProcessing } from './ScenePostProcessing'
import { useStageAppearance } from './useStageAppearance'
import { useReducedMotion } from '../../state/useReducedMotion'
import './scenes.css'

const severityOrder: Severity[] = ['critical', 'high', 'medium', 'low', 'informational']
const severityColors: Record<Severity, string> = {
  critical: '#f87171', high: '#fb923c', medium: '#facc15', low: '#60a5fa', informational: '#94a3b8',
}
const distributionCamera: [number, number, number] = [0, 4.5, 9]
const graphCamera: [number, number, number] = [0, 0, 9]

function HoverDolly({ active, origin }: { active: boolean; origin: [number, number, number] }) {
  const basePosition = useMemo(() => new Vector3(...origin), [origin])
  const hoverPosition = useMemo(() => basePosition.clone().multiplyScalar(sceneTokens.hoverDolly.activeScale), [basePosition])
  useFrame(({ camera }, delta) => {
    camera.position.lerp(active ? hoverPosition : basePosition, 1 - Math.exp(-delta / 0.16))
  })
  return null
}

function SceneOrbitControls({ enabled }: { enabled: boolean }) {
  const { camera, gl } = useThree()
  const controlsRef = useRef<ThreeOrbitControls | null>(null)
  useEffect(() => {
    const controls = new ThreeOrbitControls(camera, gl.domElement)
    controls.enableDamping = enabled
    controls.dampingFactor = 0.12
    controls.enableZoom = false
    controls.enablePan = false
    controls.autoRotate = false
    controls.minPolarAngle = 0.65
    controls.maxPolarAngle = 2.4
    controls.enabled = enabled
    controlsRef.current = controls
    return () => { controls.dispose(); controlsRef.current = null }
  }, [camera, enabled, gl])
  useFrame(() => { if (enabled) controlsRef.current?.update() })
  return null
}

/** Records renderer resource counts and the worst observed frame interval for QA. */
function StageBudgetProbe() {
  const worstFrameMs = useRef(0)
  useFrame(({ gl: renderer }, delta) => {
    const frameMs = delta * 1000
    const canvas = renderer.domElement
    if (renderer.info.render.frame === 1) {
      canvas.dataset.stageGeometryCount = String(renderer.info.memory.geometries)
      canvas.dataset.stageTextureCount = String(renderer.info.memory.textures)
    }
    if (frameMs > worstFrameMs.current) {
      worstFrameMs.current = frameMs
      canvas.dataset.stageWorstFrameIntervalMs = frameMs.toFixed(1)
      canvas.dataset.stageFrameWithinBudget = String(frameMs <= sceneTokens.performance.mainThreadFrameMs)
    }
    if (renderer.info.memory.geometries > sceneTokens.performance.maxGeometries) {
      canvas.dataset.stageGeometryBudgetExceeded = 'true'
    }
  })
  return null
}

export interface DistributionSceneProps {
  counts: Record<Severity, number>
  selected: Severity | null
  onSelect: (severity: Severity | null) => void
}

const DistributionBar = memo(function DistributionBar({ severity, count, total, active, hovered, onSelect, onHover }: {
  severity: Severity; count: number; total: number; active: boolean; hovered: boolean; onSelect: () => void; onHover: (value: boolean) => void
}) {
  const geometry = useMemo(() => new CylinderGeometry(0.42, 0.42, 1, 24), [])
  useEffect(() => () => geometry.dispose(), [geometry])
  const height = Math.max(0.12, count / Math.max(1, total) * 3.3)
  return <mesh geometry={geometry} position={[(severityOrder.indexOf(severity) - 2) * 1.45, height / 2 - 1.7, 0]} scale={[1, height, 1]} castShadow onClick={(event) => { event.stopPropagation(); onSelect() }} onPointerOver={(event) => { event.stopPropagation(); onHover(true); document.body.style.cursor = 'pointer' }} onPointerOut={() => { onHover(false); document.body.style.cursor = '' }}>
    <meshStandardMaterial color={severityColors[severity]} metalness={sceneTokens.material.metalness} roughness={sceneTokens.material.roughness} emissive={active || hovered ? severityColors[severity] : '#000000'} emissiveIntensity={active ? 0.18 : hovered ? 0.12 : 0} />
  </mesh>
})

export const DistributionScene = memo(function DistributionScene({ counts, selected, onSelect }: DistributionSceneProps) {
  const reducedMotion = useReducedMotion()
  const { enhanced, lightTheme } = useStageAppearance()
  const [hoveredSeverity, setHoveredSeverity] = useState<Severity | null>(null)
  const total = severityOrder.reduce((sum, severity) => sum + counts[severity], 0)
  return <div className="scene-composition scene-composition--distribution">
    <Canvas shadows={enhanced} aria-label="Interactive 3D distribution of illustrative findings by severity" camera={{ position: distributionCamera, fov: sceneTokens.camera.fov }} frameloop={enhanced && !reducedMotion ? 'always' : 'demand'} dpr={[1, sceneTokens.performance.maxDevicePixelRatio]} gl={{ antialias: true, powerPreference: 'low-power', alpha: false }}>
      <color attach="background" args={['#ffffff']} />
      <ambientLight color={sceneTokens.lighting.ambient} intensity={lightTheme ? 0.9 : sceneTokens.lighting.ambientIntensity} />
      <directionalLight castShadow={enhanced} color={sceneTokens.lighting.rim} intensity={lightTheme ? 0.24 : sceneTokens.lighting.rimIntensity} position={[4, 5, 3]} />
      <StageBudgetProbe />
      <group>
        {severityOrder.map((severity) => <DistributionBar key={severity} severity={severity} count={counts[severity]} total={total} active={selected === severity} hovered={hoveredSeverity === severity} onHover={(value) => setHoveredSeverity(value ? severity : null)} onSelect={() => onSelect(selected === severity ? null : severity)} />)}
      </group>
      {enhanced && !reducedMotion && <HoverDolly active={hoveredSeverity !== null} origin={distributionCamera} />}
      <SceneOrbitControls enabled={enhanced && !reducedMotion} />
      <ScenePostProcessing enabled={enhanced} />
    </Canvas>
    {hoveredSeverity && <p className="scene-tooltip" role="status">{hoveredSeverity}: {counts[hoveredSeverity]} illustrative demo record{counts[hoveredSeverity] === 1 ? '' : 's'}</p>}
    <div className="scene-legend" aria-label="Select a finding severity">
      {severityOrder.map((severity) => <button aria-pressed={selected === severity} className="scene-legend__item" key={severity} onClick={() => onSelect(selected === severity ? null : severity)} type="button"><span className="scene-legend__dot" style={{ background: severityColors[severity] }} />{severity}<strong>{counts[severity]}</strong></button>)}
    </div>
    <p className="scene-disclaimer">Illustrative demo records · no analysis was run</p>
  </div>
})

const kindColors = { contract: '#63B3ED', function: '#a78bfa', modifier: '#f472b6', state: '#5eead4', external: '#fb923c' } as const
const relationColors = { calls: '#38bdf8', reads: '#a78bfa', writes: '#fbbf24', sends: '#fb7185' } as const

const GraphNode = memo(function GraphNode({ node, position, selected, hovered, onSelect }: { node: ContractNode; position: [number, number, number]; selected: boolean; hovered: boolean; onSelect: () => void }) {
  const geometry = useMemo(() => new SphereGeometry(node.kind === 'contract' ? 0.32 : 0.23, 20, 16), [node.kind])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh castShadow geometry={geometry} position={position} onClick={(event) => { event.stopPropagation(); onSelect() }} onPointerOver={(event) => { event.stopPropagation(); document.body.style.cursor = 'pointer' }} onPointerOut={() => { document.body.style.cursor = '' }}>
    <meshStandardMaterial color={kindColors[node.kind]} metalness={sceneTokens.material.metalness} roughness={sceneTokens.material.roughness} emissive={selected || hovered ? kindColors[node.kind] : '#000000'} emissiveIntensity={selected ? 0.3 : hovered ? 0.18 : 0} />
  </mesh>
})

export interface DependencySceneProps {
  nodes: ContractNode[]
  edges: RelationEdge[]
  selectedNodeId: string | null
  activeFindingId?: string
  onSelectNode: (node: ContractNode) => void
}

export const DependencyScene = memo(function DependencyScene({ nodes, edges, selectedNodeId, activeFindingId, onSelectNode }: DependencySceneProps) {
  const reducedMotion = useReducedMotion()
  const { enhanced, lightTheme } = useStageAppearance()
  const [hovered, setHovered] = useState<string | null>(null)
  const positions = useMemo(() => {
    if (!nodes.length) return new Map<string, [number, number, number]>()
    const xs = nodes.map((node) => node.x)
    const ys = nodes.map((node) => node.y)
    const minX = Math.min(...xs); const maxX = Math.max(...xs)
    const minY = Math.min(...ys); const maxY = Math.max(...ys)
    return new Map(nodes.map((node) => [node.id, [((node.x - (minX + maxX) / 2) / Math.max(1, maxX - minX)) * 6, ((maxY - node.y) / Math.max(1, maxY - minY) - 0.5) * 4, 0] as [number, number, number]]))
  }, [nodes])
  const edgeGeometry = useMemo(() => edges.map((edge) => {
    const source = positions.get(edge.source); const target = positions.get(edge.target)
    if (!source || !target) return null
    const geometry = new BufferGeometry().setFromPoints([new Vector3(...source), new Vector3(...target)])
    return { id: edge.id, source: edge.source, target: edge.target, geometry }
  }).filter((edge): edge is { id: string; source: string; target: string; geometry: BufferGeometry } => edge !== null), [edges, positions])
  useEffect(() => () => edgeGeometry.forEach((edge) => edge.geometry.dispose()), [edgeGeometry])
  const activeEdgeCount = activeFindingId ? edges.filter((edge) => edge.findingId === activeFindingId).length : 0
  return <div className="scene-composition scene-composition--graph">
    <Canvas shadows={enhanced} aria-label="Interactive 3D contract dependency graph" camera={{ position: graphCamera, fov: sceneTokens.camera.fov }} frameloop={enhanced && !reducedMotion ? 'always' : 'demand'} dpr={[1, sceneTokens.performance.maxDevicePixelRatio]} gl={{ antialias: true, powerPreference: 'low-power', alpha: false }}>
      <color attach="background" args={['#0b1220']} />
      <ambientLight color={sceneTokens.lighting.ambient} intensity={lightTheme ? 0.9 : sceneTokens.lighting.ambientIntensity} />
      <directionalLight castShadow={enhanced} color={sceneTokens.lighting.rim} intensity={lightTheme ? 0.28 : sceneTokens.lighting.rimIntensity} position={[3, 4, 5]} />
      <StageBudgetProbe />
      {edgeGeometry.map((edge) => { const relation = edges.find((item) => item.id === edge.id)?.relation ?? 'calls'; const findingEdge = edges.find((item) => item.id === edge.id)?.findingId; const highlighted = hovered === edge.source || hovered === edge.target || (activeFindingId !== undefined && findingEdge === activeFindingId); const dimmed = activeFindingId !== undefined && activeEdgeCount > 0 && findingEdge !== activeFindingId; return <line key={edge.id}><primitive object={edge.geometry} attach="geometry" /><lineBasicMaterial color={relationColors[relation]} transparent opacity={dimmed ? 0.12 : highlighted ? sceneTokens.lines.hoverOpacity : sceneTokens.lines.opacity} /></line> })}
      {nodes.map((node) => <group key={node.id} onPointerOver={() => { setHovered(node.id); document.body.style.cursor = 'pointer' }} onPointerOut={() => { setHovered(null); document.body.style.cursor = '' }}><GraphNode node={node} position={positions.get(node.id) ?? [0, 0, 0]} selected={selectedNodeId === node.id} hovered={hovered === node.id} onSelect={() => onSelectNode(node)} /></group>)}
      {enhanced && !reducedMotion && <HoverDolly active={hovered !== null} origin={graphCamera} />}
      <SceneOrbitControls enabled={enhanced && !reducedMotion} />
      <ScenePostProcessing enabled={enhanced} />
    </Canvas>
    {hovered && <p className="scene-tooltip" role="status">{nodes.find((node) => node.id === hovered)?.label} · {nodes.find((node) => node.id === hovered)?.file}:{nodes.find((node) => node.id === hovered)?.line}</p>}
    <div className="scene-legend scene-legend--nodes" role="group" aria-label="Select a contract element">
      {nodes.map((node) => <button aria-pressed={selectedNodeId === node.id} className="scene-legend__item" key={node.id} onClick={() => onSelectNode(node)} type="button"><span className="scene-legend__dot" style={{ background: kindColors[node.kind] }} />{node.label}<small>{node.file}:{node.line}</small></button>)}
    </div>
    <div className="graph-key" role="group" aria-label="Graph legend">
      <div className="graph-key__group"><strong>Node kinds</strong>{Object.entries(kindColors).map(([kind, color]) => <span key={kind}><i style={{ background: color }} />{kind}</span>)}</div>
      <div className="graph-key__group"><strong>Relations</strong>{Object.entries(relationColors).map(([relation, color]) => <span key={relation}><i style={{ background: color }} />{relation}</span>)}</div>
    </div>
    {!nodes.length && <div className="scene-empty-message">No graph records are attached to this demo scan.</div>}
  </div>
})

export const ContractGraphScene = DependencyScene
