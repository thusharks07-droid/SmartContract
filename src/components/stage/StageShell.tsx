import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useReducedMotion } from '../../state/useReducedMotion';
import { useVisualFidelity } from '../../state/useVisualFidelity';
import { useWebGLSupport } from '../../state/useWebGLSupport';
import { SceneErrorBoundary } from './SceneErrorBoundary';
import './stage-shell.css';

export interface StageShellProps {
  title: string;
  caption: string;
  fallback: ReactNode;
  children: ReactNode;
  deferScene?: boolean;
}

function StageSkeleton() {
  return (
    <div aria-label="Loading visual stage" className="stage-skeleton" role="status">
      <span className="stage-skeleton__orb" />
      <span className="sr-only">Loading visual stage</span>
    </div>
  );
}

/** Capability-gates an optional scene and keeps its HTML fallback in the same layout. */
export function StageShell({ title, caption, fallback, children, deferScene = false }: StageShellProps) {
  const { supported, contextLost, contextReadyMs, stageRef } = useWebGLSupport();
  const { visualFidelity } = useVisualFidelity();
  const reducedMotion = useReducedMotion();
  const contentRef = useRef<HTMLDivElement>(null);
  const stageElementRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenMessage, setFullscreenMessage] = useState('');
  const [sceneReady, setSceneReady] = useState(false);

  const showFallback = !supported || contextLost || visualFidelity === 'minimal';
  const showScene = !showFallback && (!deferScene || sceneReady);

  useEffect(() => {
    if (showFallback || !deferScene || sceneReady) return;
    const timer = window.setTimeout(() => setSceneReady(true), 900);
    return () => window.clearTimeout(timer);
  }, [deferScene, sceneReady, showFallback]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content || showFallback) return;
    const labelCanvas = () => {
      content.querySelectorAll('canvas').forEach((canvas) => {
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `${title}. ${caption}`);
      });
    };
    labelCanvas();
    const observer = new MutationObserver(labelCanvas);
    observer.observe(content, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [caption, showFallback, title]);

  useEffect(() => {
    const syncFullscreen = () => {
      setIsFullscreen(document.fullscreenElement === stageElementRef.current);
    };
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);

  function setStageElement(element: HTMLDivElement | null) {
    stageElementRef.current = element;
    stageRef(element);
  }

  async function toggleFullscreen() {
    const stage = stageElementRef.current;
    if (!stage || typeof stage.requestFullscreen !== 'function') return;
    setFullscreenMessage('');
    try {
      if (document.fullscreenElement === stage) {
        await document.exitFullscreen();
      } else {
        if (document.fullscreenElement) await document.exitFullscreen();
        await stage.requestFullscreen();
      }
    } catch {
      setFullscreenMessage('Fullscreen is unavailable in this window.');
    }
  }

  const FullscreenIcon = isFullscreen ? Minimize2 : Maximize2;

  return (
    <section aria-label={title} className="stage-shell" data-context-ready-ms={contextReadyMs.toFixed(1)} data-webgl-supported={String(supported)}>
      <header className="stage-shell__header">
        <div>
          <h2 className="stage-shell__title">{title}</h2>
          <p className="stage-shell__caption">{caption}</p>
        </div>
        <button
          aria-label={isFullscreen ? 'Exit fullscreen stage' : 'Expand stage fullscreen'}
          className="stage-shell__fullscreen"
          disabled={typeof document === 'undefined' || !document.fullscreenEnabled}
          onClick={toggleFullscreen}
          type="button"
        >
          <FullscreenIcon aria-hidden="true" size={16} />
          <span>{isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}</span>
        </button>
      </header>

      <div className="stage-shell__frame" ref={setStageElement}>
        <div className="stage-shell__viewport" ref={contentRef}>
          {!showScene ? (
            <div className="stage-shell__fallback" data-testid="stage-fallback">
              {fallback}
            </div>
          ) : (
            <SceneErrorBoundary
              fallback={
                <div className="stage-shell__fallback" data-testid="stage-fallback">
                  {fallback}
                </div>
              }
            >
              <Suspense fallback={<StageSkeleton />}>
                <div
                  className="stage-shell__scene"
                  data-reduced-motion={reducedMotion ? 'true' : 'false'}
                  data-testid="stage-scene"
                >
                  {children}
                </div>
              </Suspense>
            </SceneErrorBoundary>
          )}
        </div>
      </div>
      {showScene && reducedMotion && (
        <section aria-label={`${title} accessible data and selection view`} className="stage-shell__motion-legend">
          <h3>Static view and accessible controls</h3>
          {fallback}
        </section>
      )}
      <p aria-live="polite" className="sr-only">{fullscreenMessage}</p>
    </section>
  );
}
