import { useAppReducedMotion } from './useAppReducedMotion';

/** Combines the operating-system preference with ContractIQ's in-app setting. */
export function useReducedMotion(): boolean {
  return Boolean(useAppReducedMotion());
}
