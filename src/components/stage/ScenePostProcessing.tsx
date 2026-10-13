import { Suspense, lazy } from 'react'

const PostProcessingEffects = lazy(() => import('@react-three/postprocessing').then(({ Bloom, EffectComposer, N8AO }) => ({
  default: function PostProcessingEffects() {
    return (
      <EffectComposer multisampling={0}>
        <N8AO aoRadius={1.5} intensity={1.1} />
        <Bloom intensity={0.28} luminanceThreshold={0.82} mipmapBlur />
      </EffectComposer>
    )
  },
})))

export function ScenePostProcessing({ enabled }: { enabled: boolean }) {
  if (!enabled) return null
  return (
    <Suspense fallback={null}><PostProcessingEffects /></Suspense>
  )
}
