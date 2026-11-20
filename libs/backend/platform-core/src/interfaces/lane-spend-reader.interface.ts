import type { ApiLaneSpend } from '@ptah-extension/shared';

/** Host-neutral query boundary. Unavailable storage returns an explicit state. */
export interface LaneSpendReader {
  readSpend(ownerKey: string, nowMs?: number): Promise<ApiLaneSpend>;
}
