import type { PhaseKind } from '@ptah-extension/shared';

/** Host adapter for the active orchestration skill's phase files. */
export interface PhaseDefinitionReader {
  read(kind: PhaseKind): Promise<string>;
}
