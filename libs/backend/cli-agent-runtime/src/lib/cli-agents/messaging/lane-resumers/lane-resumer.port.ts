import type {
  AgentId,
  AgentProcessInfo,
  AgentResumeOutcome,
  InlineImageAttachment,
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
   * `files` are workspace files attached to this turn. `images` ride on the
   * resumed first turn; a resumer that cannot carry them refuses, never drops.
   */
  resume(
    info: AgentProcessInfo,
    task: string,
    files?: readonly string[],
    images?: readonly InlineImageAttachment[],
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
    /**
     * `policy-refused`: the resumed lane's permission or network policy is not
     * valid for the CLI now (for example the parent-plan cap on a CLI without
     * a plan mode). Retrying cannot help, so it is not retryable.
     * `turn-input-refused`: the resume cannot carry the turn's images.
     */
    readonly code:
      | 'no-session'
      | 'spawn-failed'
      | 'blocked-command'
      | 'turn-settings-refused'
      | 'policy-refused'
      | 'turn-input-refused',
    message: string,
  ) {
    super(message);
    this.name = 'LaneResumeError';
  }
}
