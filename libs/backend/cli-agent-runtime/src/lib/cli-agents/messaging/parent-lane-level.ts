import type { LanePermissionMode } from '@ptah-extension/shared';

/** Reads the current host session state, never a lane's stored policy. */
export type ParentLaneLevel = (parentSessionId: string | undefined) => LanePermissionMode | undefined;
