// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StageShell } from './StageShell';
import { useVisualFidelity } from '../../state/useVisualFidelity';
import { resetWebGLSupportCacheForTests } from '../../state/useWebGLSupport';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  resetWebGLSupportCacheForTests();
  window.localStorage.clear();
});

beforeEach(() => {
  resetWebGLSupportCacheForTests();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  window.localStorage.clear();
  window.localStorage.setItem('contractiq.settings', JSON.stringify({ visualFidelity: 'enhanced' }));
});

function Stage({ title = 'Dependency map' }: { title?: string }) {
  return (
    <StageShell title={title} caption="Deterministic demo visualization" fallback={<p>2D dependency list</p>}>
      <canvas data-testid={`${title}-canvas`} />
    </StageShell>
  );
}

describe('StageShell capability and fidelity gates', () => {
  it('renders its 2D fallback when WebGL is unavailable', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);

    render(<Stage />);

    expect(screen.getByText('2D dependency list')).toBeTruthy();
    expect(screen.queryByTestId('Dependency map-canvas')).toBeNull();
  });

  it('uses the 2D fallback when creating a WebGL context exceeds the 400 ms budget', () => {
    let now = 100;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => {
        now = 501;
        return { getExtension: () => null } as unknown as WebGLRenderingContext;
      },
    );

    render(<Stage />);

    expect(screen.getByText('2D dependency list')).toBeTruthy();
    expect(screen.queryByTestId('Dependency map-canvas')).toBeNull();
    expect(screen.getByRole('region', { name: 'Dependency map' }).getAttribute('data-webgl-supported')).toBe('false');
  });

  it('switches every mounted stage to its 2D fallback when fidelity becomes Minimal', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => ({}) as WebGLRenderingContext,
    );

    function AllStages() {
      const { setVisualFidelity } = useVisualFidelity();
      return (
        <>
          <button onClick={() => setVisualFidelity('minimal')} type="button">
            Switch to Minimal
          </button>
          <Stage title="Contract graph" />
          <Stage title="Call flow" />
          <Stage title="Storage layout" />
        </>
      );
    }

    render(<AllStages />);
    expect(screen.queryAllByTestId('stage-fallback')).toHaveLength(0);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Switch to Minimal' }));
    });

    expect(screen.getAllByTestId('stage-fallback')).toHaveLength(3);
    expect(document.documentElement.dataset.fidelity).toBe('minimal');
    expect(screen.queryByTestId('Contract graph-canvas')).toBeNull();
    expect(screen.queryByTestId('Call flow-canvas')).toBeNull();
    expect(screen.queryByTestId('Storage layout-canvas')).toBeNull();
  });

  it('applies Enhanced to Standard changes immediately to the shared fidelity setting', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => ({}) as WebGLRenderingContext,
    );

    function FidelityControl() {
      const { setVisualFidelity } = useVisualFidelity();
      return <button onClick={() => setVisualFidelity('standard')} type="button">Switch to Standard</button>;
    }

    render(<><FidelityControl /><Stage /></>);
    expect(document.documentElement.dataset.fidelity).toBe('enhanced');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Switch to Standard' })));
    expect(document.documentElement.dataset.fidelity).toBe('standard');
    expect(screen.getByTestId('stage-scene')).toBeTruthy();
  });

  it('keeps a static scene and exposes the full HTML view for saved Reduced motion', () => {
    window.localStorage.setItem(
      'contractiq.settings',
      JSON.stringify({ visualFidelity: 'enhanced', motion: 'reduced', motionExplicit: true }),
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => ({}) as WebGLRenderingContext,
    );

    render(<Stage />);

    expect(screen.getByTestId('stage-scene').getAttribute('data-reduced-motion')).toBe('true');
    expect(screen.getByText('Static view and accessible controls')).toBeTruthy();
    expect(screen.getAllByText('2D dependency list')).toHaveLength(1);
  });

  it('swaps to the 2D fallback on context loss without an uncaught window error', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => ({}) as WebGLRenderingContext,
    );
    const onWindowError = vi.fn();
    window.addEventListener('error', onWindowError);

    render(<Stage />);
    const canvas = screen.getByTestId('Dependency map-canvas');
    expect(screen.queryByTestId('stage-fallback')).toBeNull();

    act(() => {
      fireEvent(
        canvas,
        new Event('webglcontextlost', { bubbles: true, cancelable: true }),
      );
    });

    expect(screen.getByTestId('stage-fallback')).toBeTruthy();
    expect(onWindowError).not.toHaveBeenCalled();
    window.removeEventListener('error', onWindowError);
  });

  it('swaps a crashed scene for its fallback', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => ({}) as WebGLRenderingContext,
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <StageShell title="Dependency map" caption="Demo" fallback={<p>Scene fallback</p>}>
        <ThrowingScene />
      </StageShell>,
    );

    expect(screen.getByText('Scene fallback')).toBeTruthy();
    expect(screen.queryByTestId('stage-scene')).toBeNull();
  });
});

function ThrowingScene(): never {
  throw new Error('Scene failed to render');
}
