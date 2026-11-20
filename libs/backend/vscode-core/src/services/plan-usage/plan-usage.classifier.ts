import type { ApiLaneSpend, LaneSpend, PlanLimitWindow } from '@ptah-extension/shared';
import type { LaneSpendReader } from '@ptah-extension/platform-core';

/** Billing mode is captured by the caller, never guessed from model identity. */
export async function classifyLaneUsage(input:
  | { readonly kind: 'plan'; readonly windows: readonly PlanLimitWindow[] }
  | { readonly kind: 'api-spend'; readonly ownerKey: string; readonly reader: LaneSpendReader; readonly nowMs?: number },
): Promise<LaneSpend> {
  if (input.kind === 'plan') return { kind: 'plan', windows: input.windows };
  const spend: ApiLaneSpend = await input.reader.readSpend(input.ownerKey, input.nowMs);
  return spend;
}
