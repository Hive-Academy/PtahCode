import type { LaneModelSource } from './cli-adapters/cli-adapter.interface';
import type { AgentTurnTelemetry, CliType } from '@ptah-extension/shared';

export function requestedModelForLog(model: string | undefined): string {
  return model?.trim().slice(0, 128) || 'none';
}

export interface LaneModelLogState {
  requestedModel: string;
  selectedModel: string;
  modelSource: LaneModelSource;
  selectedEffort: string;
  actualModel?: string;
  loggedCompletionAt?: string;
}

export function laneModelOutcome(
  agentId: string,
  cli: string,
  state: LaneModelLogState,
) {
  return {
    agentId,
    cli,
    requestedModel: state.requestedModel,
    selectedModel: state.selectedModel,
    modelSource: state.modelSource,
    selectedEffort: state.selectedEffort,
    actualModel: state.actualModel ?? 'unobserved',
  };
}

export function observedModelFrom(
  cli: CliType,
  turnTelemetry: AgentTurnTelemetry,
): string | undefined {
  if (cli === 'pi' || turnTelemetry.status !== 'reported') return undefined;
  const id = turnTelemetry.usage.modelId.trim();
  if (!id || id.endsWith('/unknown') || id.endsWith('/multi-model')) return undefined;
  return id.slice(0, 128);
}

export function takeOutcomeLog(
  state: LaneModelLogState,
  agentId: string,
  cli: string,
  completedAt: string,
): ReturnType<typeof laneModelOutcome> | undefined {
  if (state.loggedCompletionAt === completedAt) return undefined;
  state.loggedCompletionAt = completedAt;
  return laneModelOutcome(agentId, cli, state);
}
