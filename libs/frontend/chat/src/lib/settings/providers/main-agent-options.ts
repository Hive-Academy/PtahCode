import type {
  ProvidersConnection,
  ProvidersSettingsStateService,
  ProviderAccountChoice,
} from '@ptah-extension/core';
import type { AccountSelectorValue } from './accounts/account-presentation';
import type { EffortLevel, ProviderModelInfo } from '@ptah-extension/shared';

export const ACTIVATABLE: ReadonlySet<string> = new Set([
  'connected',
  'reachable',
  'unknown',
  'skipped',
]);
export const EFFORT_LEVELS: readonly EffortLevel[] = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];
export const MODALITY: Readonly<Record<string, string>> = {
  apiKey: 'API key',
  cli: 'CLI login',
  oauth: 'OAuth',
  'local-native': 'Local server',
  'local-proxy': 'Local server',
  custom: 'Custom endpoint',
};

/** Keep a saved model selectable even when the provider's current catalogue omits it. */
export function mainAgentModelOptions(
  models: readonly ProviderModelInfo[],
  selected: string,
) {
  const options = models.map((model) => ({
    id: model.id,
    label: `${model.name || model.id} [Tool: ${model.supportsToolUse ? 'Yes' : 'No'}]`,
  }));
  return selected && !options.some((model) => model.id === selected)
    ? [
        { id: selected, label: `${selected} \u00b7 not in current catalog` },
        ...options,
      ]
    : options;
}

export interface ModelCatalogue {
  readonly status: 'loading' | 'ready' | 'error';
  readonly models: readonly ProviderModelInfo[];
  /** The saved-list disclosure when the host served a saved (`persisted`) list; `null` for a live one. */
  readonly notice: string | null;
}
export type MainAgentPatch = Parameters<
  ProvidersSettingsStateService['saveSettings']
>[0];
export interface AccountIntent {
  readonly value: AccountSelectorValue;
  readonly choice: ProviderAccountChoice;
  readonly selectionRevision: number;
  readonly profileRevision: number | null;
}

/** Only the active provider and configured, usable connections can become the main agent. */
export function mainAgentProviderOptions(
  connections: readonly ProvidersConnection[],
  providers: readonly { readonly id: string; readonly status: string }[],
  driverId: string,
) {
  const statuses = new Map(
    providers.map((provider) => [provider.id, provider.status]),
  );
  return connections
    .filter(
      (entry) =>
        entry.id === driverId ||
        (entry.configured && ACTIVATABLE.has(statuses.get(entry.id) ?? '')),
    )
    .map((entry) => ({
      id: entry.id,
      label: `${entry.name} \u00b7 ${MODALITY[entry.authMode] ?? entry.authMode}`,
      name: entry.name,
      uncheckable:
        statuses.get(entry.id) === 'unknown' ||
        statuses.get(entry.id) === 'skipped',
    }));
}
