import type { SessionStatsEntry } from '@ptah-extension/shared';
import { sdkContribution, sumUsageValues, type UsageAmount, type UsageMetric } from './session-usage-totals';

/** SDK subagent and background inspector rows. */
export interface OrchestratorUsageRow {
  readonly key: string;
  readonly usage: {
    readonly tokens: number | null;
    readonly cost: number | null;
  };
}

type OrchestratorUsageAmount = UsageAmount & { readonly preferLowerBoundMarker?: true };

export function orchestratorUsage(
  snapshot: SessionStatsEntry | null,
  rows: readonly OrchestratorUsageRow[],
): { readonly tokens: OrchestratorUsageAmount; readonly cost: OrchestratorUsageAmount } {
  const sdk = sdkContribution(snapshot);
  const lanes = new Map<string, OrchestratorUsageRow[]>();
  for (const row of rows) {
    if (!row.key.startsWith('sub:') && !row.key.startsWith('bg:')) continue;
    const id = row.key.slice(row.key.indexOf(':') + 1);
    const aliases = lanes.get(id) ?? [];
    if (row.key.startsWith('sub:')) aliases.unshift(row);
    else aliases.push(row);
    lanes.set(id, aliases);
  }
  return {
    tokens: subtractSubagents(sdk.tokens, lanes, 'tokens'),
    cost: subtractSubagents(sdk.cost, lanes, 'cost'),
  };
}

function subtractSubagents(
  snapshot: UsageAmount,
  lanes: ReadonlyMap<string, readonly OrchestratorUsageRow[]>,
  metric: UsageMetric,
): OrchestratorUsageAmount {
  if (snapshot.value === null) return snapshot;
  if (lanes.size === 0) {
    return snapshot.lowerBound && snapshot.estimated
      ? { ...snapshot, preferLowerBoundMarker: true }
      : snapshot;
  }

  const values = [snapshot.value];
  for (const aliases of lanes.values()) {
    const value = aliases
      .map((row) => row.usage[metric])
      .find((value) => value !== null && Number.isFinite(value) && value >= 0);
    if (value === undefined || value === null) {
      return { ...snapshot, value: null, causes: [...snapshot.causes, 'A subagent reported no usage'] };
    }
    values.push(-value);
  }

  const value = sumUsageValues(values, metric);
  return value < 0
    ? { ...snapshot, value: null, causes: [...snapshot.causes, 'Subagent usage exceeds the session snapshot'] }
    : { ...snapshot, value, estimated: true, preferLowerBoundMarker: true };
}

export function orchestratorModel(
  live: { readonly model: string } | null,
  snapshot: SessionStatsEntry | null,
): string {
  return live?.model || snapshot?.contextSnapshot?.model || 'Model not attributed';
}
