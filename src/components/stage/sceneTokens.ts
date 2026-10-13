/** Shared visual and runtime budgets for the optional ContractIQ stage scenes. */
export const sceneTokens = {
  camera: { fov: 38 },
  hoverDolly: { minPercent: -4, maxPercent: 4, activeScale: 0.96 },
  material: { metalness: 0.1, roughness: 0.65 },
  lighting: { ambient: '#A1ADBC', ambientIntensity: 0.55, rim: '#63B3ED', rimIntensity: 0.15 },
  lines: { opacity: 0.35, hoverOpacity: 0.9 },
  motion: {
    durationMs: { enter: 420, hover: 160, route: 240 },
    easing: {
      enter: 'cubic-bezier(0.22, 1, 0.36, 1)',
      hover: 'ease-out',
      route: 'cubic-bezier(0.22, 1, 0.36, 1)',
    },
  },
  performance: {
    contextReadyMs: 400,
    gpuMemoryMb: 90,
    mainThreadFrameMs: 50,
    dashboardLcpMs: 2500,
    maxDevicePixelRatio: 1.5,
    maxGeometries: 16,
  },
} as const;
