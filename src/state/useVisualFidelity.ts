import { useCallback, useEffect, useState } from 'react';
import { settingsService } from '../services/settingsService';

export type VisualFidelity = 'enhanced' | 'standard' | 'minimal';

const SETTINGS_EVENT = 'contractiq:settings-updated';

function readFidelity(): VisualFidelity {
  return settingsService.get().visualFidelity;
}

export interface VisualFidelityState {
  visualFidelity: VisualFidelity;
  setVisualFidelity: (value: VisualFidelity) => void;
}

/** Reads and persists the app's shared visual-fidelity setting. */
export function useVisualFidelity(): VisualFidelityState {
  const [visualFidelity, setState] = useState<VisualFidelity>(readFidelity);

  useEffect(() => {
    const sync = () => {
      const value = readFidelity();
      setState(value);
      document.documentElement.dataset.fidelity = value;
    };
    sync();
    window.addEventListener(SETTINGS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(SETTINGS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const setVisualFidelity = useCallback((value: VisualFidelity) => {
    setState(value);
    document.documentElement.dataset.fidelity = value;
    if (typeof window !== 'undefined') settingsService.set({ visualFidelity: value });
  }, []);

  return { visualFidelity, setVisualFidelity };
}
