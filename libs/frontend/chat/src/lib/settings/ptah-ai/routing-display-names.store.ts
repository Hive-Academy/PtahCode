import { computed, inject, Injectable } from '@angular/core';
import { ProvidersSettingsStateService } from '@ptah-extension/core';
import { cliModelDisplay, systemCliDisplayName } from './cli-matrix-rows';

export interface RoutingLabel {
  readonly text: string;
  readonly raw: string | null;
  readonly loading: boolean;
}

const TASK_NAMES: Readonly<Record<string, string>> = {
  plan: 'Plan', implement: 'Implement', review: 'Review',
  research: 'Research', tests: 'Tests', docs: 'Docs',
};

function words(value: string): string {
  const joined = value.split('-').filter(Boolean).join(' ');
  return joined.charAt(0).toUpperCase() + joined.slice(1) || value;
}

@Injectable({ providedIn: 'root' })
export class RoutingDisplayNamesStore {
  private readonly state = inject(ProvidersSettingsStateService);
  private readonly agents = computed(() => new Map(
    (this.state.cliAgents().data ?? []).map((agent) => [agent.id, agent.name]),
  ));

  executor(id: string): RoutingLabel {
    if (id.startsWith('pc-')) {
      const name = this.agents().get(id);
      if (name) return { text: name, raw: null, loading: false };
      if (this.state.cliAgents().status === 'loading' || this.state.cliAgents().status === 'unloaded') {
        return { text: 'Loading executor…', raw: id, loading: true };
      }
      return { text: 'Unknown executor', raw: id, loading: false };
    }
    if (id.startsWith('subagent:')) return { text: words(id.slice(9)), raw: id, loading: false };
    const system = systemCliDisplayName(id);
    return { text: system ?? words(id), raw: system ? null : id, loading: false };
  }

  route(key: string): RoutingLabel {
    const [first, second] = key.split('|');
    if (!second) return { text: words(key), raw: key, loading: false };
    return {
      text: `${TASK_NAMES[first] ?? words(first)} · ${TASK_NAMES[second] ? second : words(second)}`,
      raw: null, loading: false,
    };
  }

  model(value: string): RoutingLabel {
    if (value === '*') return { text: 'All models', raw: null, loading: false };
    const parsed = cliModelDisplay(value);
    const tab = value.indexOf('\t');
    const display = tab >= 0 ? value.slice(tab + 1).trim() : '';
    const saved = Object.values(this.state.cliModels().data ?? {})
      .map((config) => config.selectedModel)
      .find((candidate) => candidate && cliModelDisplay(candidate).label === parsed.label);
    const savedName = saved?.includes('\t') ? saved.slice(saved.indexOf('\t') + 1).trim() : '';
    const name = display || savedName || parsed.label;
    return { text: name, raw: name === value ? value : null, loading: false };
  }
}
