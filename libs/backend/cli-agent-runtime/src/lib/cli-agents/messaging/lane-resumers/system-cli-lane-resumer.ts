import type { AgentProcessInfo, InlineImageAttachment } from '@ptah-extension/shared';
import type { AgentProcessManager } from '../../agent-process-manager.service';
import type { ParentLaneLevel } from '../parent-lane-level';
import { LaneAccountResumeError } from '../../lane-resume-gate';
import { LaneSpawnPolicyError } from '../../lane-spawn-policy';
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
    files?: readonly string[],
    images?: readonly InlineImageAttachment[],
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
        // The resumed process starts with the lane's current settings (A11).
        ...(info.model ? { model: info.model } : {}),
        ...(info.reasoningEffort ? { effort: info.reasoningEffort } : {}),
        ...(files && files.length > 0 ? { files: [...files] } : {}),
        ...(images && images.length > 0 ? { turnImages: images } : {}),
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
      // Fixed host text naming the policy source and the CLI's own reason.
      if (error instanceof LaneSpawnPolicyError)
        throw new LaneResumeError('policy-refused', error.message);
      throw new LaneResumeError(
        'spawn-failed',
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
