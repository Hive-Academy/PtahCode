import type {
  AgentId,
  AgentProcessInfo,
  AgentResumeOutcome,
} from '@ptah-extension/shared';

export interface LaneResumeResult {
  readonly agentId: AgentId;
  readonly cliSessionId?: string;
  readonly resumeDecision?: AgentResumeOutcome;
}

export interface LaneResumer {
  /**
   * Resume `info`'s session with `task` as the next prompt. `info.model` and
   * `info.reasoningEffort` are the settings the resumed process starts with;
   * `files` are workspace files attached to this turn.
   */
  resume(
    info: AgentProcessInfo,
    task: string,
    files?: readonly string[],
  ): Promise<LaneResumeResult>;
}

/**
 * Refuses a provider `/command` the host hides (D18) before any spawn: the
 * text that would start the resumed turn, and the record's static blocked list.
 */
export interface LaneResumeGuard {
  readonly rawBody: string;
  readonly blocked: readonly string[];
}

export class LaneResumeError extends Error {
  constructor(
    readonly code: 'no-session' | 'spawn-failed' | 'blocked-command',
    message: string,
  ) {
    super(message);
    this.name = 'LaneResumeError';
  }
}
