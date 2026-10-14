import { useAppReducedMotion } from './useAppReducedMotion';

/** Combines the operating-system preference with smartBOB's in-app setting. */
export function useReducedMotion(): boolean {
  return Boolean(useAppReducedMotion());
}
