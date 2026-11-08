import type { AgentProcessInfo } from '@ptah-extension/shared';
import type { AgentProcessManager } from '../../agent-process-manager.service';
import type { ParentLaneLevel } from '../parent-lane-level';
import { LaneAccountResumeError } from '../../lane-resume-gate';
import {
  LaneResumeError,
  type LaneResumer,
  type LaneResumeResult,
} from './lane-resumer.port';

export type SystemCliLaneResumerManager = Pick<
  AgentProcessManager,
  'spawn' | 'releaseIdleForResume'
>;

/** Resumes a system CLI through the process manager's spawn and resume gate. */
export class SystemCliLaneResumer implements LaneResumer {
  constructor(private readonly manager: SystemCliLaneResumerManager,
    private readonly parentLevel?: ParentLaneLevel) {}

  async resume(
    info: AgentProcessInfo,
    task: string,
  ): Promise<LaneResumeResult> {
    if (!info.cliSessionId) {
      throw new LaneResumeError(
        'no-session',
        'No CLI session is available for resume.',
      );
    }
    try {
      await this.manager.releaseIdleForResume(info.agentId);
      return await this.manager.spawn({
        cli: info.cli,
        task,
        workingDirectory: info.workingDirectory,
        resumeSessionId: info.cliSessionId,
        parentSessionId: info.parentSessionId,
        ...(this.parentLevel && info.parentSessionId
          ? { parentLevel: this.parentLevel(info.parentSessionId) } : {}),
        ptahCliId: info.ptahCliId,
        resumedFromAgentId: info.agentId,
        permission: info.effectivePolicy?.permission,
        network: info.effectivePolicy?.network,
        resumePolicy: info.effectivePolicy,
      });
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
