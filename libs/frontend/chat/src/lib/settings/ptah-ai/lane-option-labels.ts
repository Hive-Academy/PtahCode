import { PERMISSION_LEVEL_NAMES } from '@ptah-extension/shared';
import type {
  LaneNetworkMode,
  LanePermissionMode,
} from '@ptah-extension/shared';

/** Settings wording for the shared permission modes; values remain wire identifiers. */
export const LANE_PERMISSION_LABELS: Readonly<
  Record<LanePermissionMode, string>
> = {
  ...PERMISSION_LEVEL_NAMES,
  plan: 'Plan only',
  ask: 'Ask before edits',
  'auto-edit': 'Auto edit',
  yolo: 'Yolo',
};
export const LANE_NETWORK_LABELS: Readonly<Record<LaneNetworkMode, string>> = {
  allow: 'Allowed',
  deny: 'Blocked',
};
