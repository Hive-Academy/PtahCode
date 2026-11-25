import {
  EFFORT_LEVELS,
  type AgentProcessInfo,
  type CliType,
  type EffortLevel,
  type LaneNetworkMode,
  type LanePermissionMode,
  type SpawnAgentResult,
} from '@ptah-extension/shared';
import type { SessionMetadataStore } from '@ptah-extension/agent-sdk';
import type { Logger } from '@ptah-extension/vscode-core';
import type { AgentProcessManager } from '../../agent-process-manager.service';
import type { ParentLaneLevel } from '../parent-lane-level';
import { LaneAccountResumeError } from '../../lane-resume-gate';
import type { PtahCliRegistry } from '../../../ptah-cli/ptah-cli-registry';
import {
  LaneResumeError,
  type LaneResumer,
  type LaneResumeResult,
} from './lane-resumer.port';

export interface PtahCliResumeParams {
  readonly cliSessionId: string;
  readonly cli: CliType;
  readonly task: string;
  readonly parentSessionId?: string;
  readonly ptahCliId: string;
  readonly previousAgentId?: string;
  /** The lane's saved policy; a resume keeps the permission and network it ran under. */
  readonly permission?: LanePermissionMode;
  readonly network?: LaneNetworkMode;
  readonly effectivePolicy?: import('@ptah-extension/shared').EffectiveLanePolicy;
  /** Provider model id the resumed SDK query starts with. */
  readonly model?: string;
  /** Effort the resumed SDK query starts with; absent keeps the agent's saved effort. */
  readonly reasoningEffort?: EffortLevel;
}

function isEffortLevel(value: string): value is EffortLevel {
  return (EFFORT_LEVELS as readonly string[]).includes(value);
}

/**
 * Ptah CLI lanes take attached files as path text (D14): the paths follow the
 * prompt, one per line. A text with no files is returned unchanged.
 */
export function withFileReferences(task: string, files?: readonly string[]): string {
  if (!files || files.length === 0) return task;
  return `${task}\n\nAttached files:\n${files.map((file) => `- ${file}`).join('\n')}`;
}

export type PtahCliLaneResumerManager = Pick<
  AgentProcessManager,
  'prepareSdkHandleSpawn' | 'reserveAgentId' | 'laneToolGateFor' | 'spawnFromSdkHandle'
>;

/** Owns the registry-backed Ptah CLI resume sequence for RPC and cold sends. */
export class PtahCliLaneResumer implements LaneResumer {
  constructor(
    private readonly manager: PtahCliLaneResumerManager,
    private readonly registry: Pick<
      PtahCliRegistry,
      'spawnAgent' | 'getMcpPort'
    >,
    private readonly sessionMetadata: Pick<SessionMetadataStore, 'createChild'>,
    private readonly logger: Pick<Logger, 'warn'>,
    private readonly parentLevel?: ParentLaneLevel,
  ) {}

  resume(
    info: AgentProcessInfo,
    task: string,
    files?: readonly string[],
  ): Promise<LaneResumeResult> {
    if (!info.cliSessionId) {
      throw new LaneResumeError(
        'no-session',
        'No CLI session is available for resume.',
      );
    }
    if (!info.ptahCliId) {
      throw new LaneResumeError(
        'spawn-failed',
        'No Ptah CLI agent id is available for resume.',
      );
    }
    const effort = info.reasoningEffort;
    if (effort !== undefined && !isEffortLevel(effort)) {
      // Refused before any spawn, so the send fails visibly instead of
      // resuming with the agent's saved effort.
      throw new LaneResumeError(
        'turn-settings-refused',
        `Ptah CLI has no effort level "${effort.slice(0, 40)}".`,
      );
    }
    return this.resumePtahCli(
      {
        cliSessionId: info.cliSessionId,
        cli: info.cli,
        task: withFileReferences(task, files),
        parentSessionId: info.parentSessionId,
        ptahCliId: info.ptahCliId,
        // The model and effort are carried into the resumed query (A11).
        ...(info.model ? { model: info.model } : {}),
        ...(effort !== undefined ? { reasoningEffort: effort } : {}),
        previousAgentId: info.agentId,
        permission: info.effectivePolicy?.permission,
        network: info.effectivePolicy?.network,
        effectivePolicy: info.effectivePolicy,
      },
      info.workingDirectory,
    );
  }

  async resumePtahCli(
    params: PtahCliResumeParams,
    workspaceRoot: string,
  ): Promise<SpawnAgentResult> {
    try {
      const parentSessionId = params.parentSessionId || undefined;
      const prepared = await this.manager.prepareSdkHandleSpawn({
        cli: 'ptah-cli',
        task: params.task,
        // R9.5 checks the model this resume launches, not only the default.
        ...(params.model ? { model: params.model } : {}),
        resumeSessionId: params.cliSessionId,
      });
      const agentId = this.manager.reserveAgentId();
      const spawnResult = await this.registry.spawnAgent(
        params.ptahCliId,
        prepared.task,
        {
          workingDirectory: workspaceRoot,
          resumeSessionId: prepared.resumeSessionId,
          ...(prepared.checkResumeOwner ? { checkResumeOwner: prepared.checkResumeOwner } : {}),
          parentSessionId,
          ...(this.parentLevel && parentSessionId
            ? { parentLevel: this.parentLevel(parentSessionId) } : {}),
          agentId,
          ...(params.model ? { model: params.model } : {}),
          ...(params.reasoningEffort ? { reasoningEffort: params.reasoningEffort } : {}),
          laneToolGate: this.manager.laneToolGateFor(agentId),
          ...(params.permission ? { permission: params.permission } : {}),
          ...(params.network ? { network: params.network } : {}),
          ...(params.effectivePolicy ? { resumePolicy: params.effectivePolicy } : {}),
        },
      );
      if ('status' in spawnResult) {
        throw new LaneResumeError(
          'spawn-failed',
          `Ptah CLI agent resume failed: ${spawnResult.message}`,
        );
      }

      spawnResult.handle.onSessionResolved?.((sessionId: string) => {
        this.sessionMetadata
          .createChild(sessionId, workspaceRoot, spawnResult.agentName)
          .catch((error: unknown) => {
            this.logger.warn('[PtahCliLaneResumer] Failed to save child session metadata', {
              error: error instanceof Error ? error.message : String(error),
            });
          });
      });

      const result = await this.manager.spawnFromSdkHandle(spawnResult.handle, {
        task: params.task,
        cli: 'ptah-cli',
        workingDirectory: workspaceRoot,
        parentSessionId,
        ptahCliName: spawnResult.agentName,
        ptahCliId: params.ptahCliId,
        resumedFromAgentId: params.previousAgentId,
        resumeSessionId: prepared.resumeSessionId,
        ...(prepared.resumeDecision
          ? { resumeDecision: prepared.resumeDecision }
          : {}),
        ...(prepared.originalTask !== undefined
          ? { originalTask: prepared.originalTask }
          : {}),
        agentId,
        mcpPort: this.registry.getMcpPort(),
        expectsMcp: true,
        // Stored on the new record, so the next resume keeps the same policy,
        // model and effort.
        effectivePolicy: spawnResult.effectivePolicy,
        ...(params.model ? { model: params.model } : {}),
        ...(params.reasoningEffort ? { reasoningEffort: params.reasoningEffort } : {}),
      });
      spawnResult.setAgentId(result.agentId);
      return result;
    } catch (error: unknown) {
      if (
        error instanceof LaneResumeError ||
        error instanceof LaneAccountResumeError
      ) {
        throw error;
      }
      throw new LaneResumeError(
        'spawn-failed',
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
