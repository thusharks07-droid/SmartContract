import { useCallback, useEffect, useRef, useState } from 'react';
import { sceneTokens } from '../components/stage/sceneTokens';

let cachedWebGLSupport: boolean | undefined;
let cachedContextReadyMs = 0;

function detectWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  if (cachedWebGLSupport !== undefined) return cachedWebGLSupport;
  const startedAt = performance.now();
  try {
    const canvas = document.createElement('canvas');
    const context =
      canvas.getContext('webgl2') ||
        canvas.getContext('webgl') ||
        canvas.getContext('experimental-webgl');
    cachedContextReadyMs = performance.now() - startedAt;
    cachedWebGLSupport = Boolean(context) && cachedContextReadyMs <= sceneTokens.performance.contextReadyMs;
    const webglContext = context as WebGLRenderingContext | WebGL2RenderingContext | null;
    webglContext?.getExtension?.('WEBGL_lose_context')?.loseContext();
    return cachedWebGLSupport;
  } catch {
    cachedContextReadyMs = performance.now() - startedAt;
    cachedWebGLSupport = false;
    return cachedWebGLSupport;
  }
}

/** Clears the shared capability probe between isolated unit tests. */
export function resetWebGLSupportCacheForTests(): void {
  cachedWebGLSupport = undefined;
  cachedContextReadyMs = 0;
}

export interface WebGLSupport {
  supported: boolean;
  contextLost: boolean;
  contextReadyMs: number;
  stageRef: (element: HTMLDivElement | null) => void;
}

/** Detects WebGL once and scopes context loss/restoration listeners to one stage. */
export function useWebGLSupport(): WebGLSupport {
  const [supported] = useState(detectWebGL);
  const [contextLost, setContextLost] = useState(false);
  const nodeRef = useRef<HTMLDivElement | null>(null);

  const stageRef = useCallback((element: HTMLDivElement | null) => {
    nodeRef.current = element;
  }, []);

  useEffect(() => {
    const stage = nodeRef.current;
    if (!stage) return;

    const onLost = (event: Event) => {
      event.preventDefault();
      setContextLost(true);
    };
    const onRestored = () => setContextLost(false);

    stage.addEventListener('webglcontextlost', onLost, true);
    stage.addEventListener('webglcontextrestored', onRestored, true);
    return () => {
      stage.removeEventListener('webglcontextlost', onLost, true);
      stage.removeEventListener('webglcontextrestored', onRestored, true);
    };
  }, [supported]);

  return { supported, contextLost, contextReadyMs: cachedContextReadyMs, stageRef };
}
