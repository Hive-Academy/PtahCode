import type {
  EffortLevel,
  IAgentAdapter,
  SessionId,
} from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';

/** What a chat turn asks for. Both fields are optional. */
export interface LiveTurnSettings {
  readonly model?: string;
  readonly effort?: EffortLevel;
}

/**
 * Longest wait for one control request. The user message is sent after the
 * apply, so a hung query process must not block it.
 */
export const LIVE_TURN_SETTINGS_TIMEOUT_MS = 5000;

/**
 * Run one apply call with a deadline. A rejection and a timeout are both
 * logged. Neither one stops the turn.
 */
async function applyOne(
  logger: Logger,
  what: 'model' | 'effort',
  context: Record<string, unknown>,
  call: () => Promise<void>,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), LIVE_TURN_SETTINGS_TIMEOUT_MS);
  });
  try {
    const outcome = await Promise.race([call().then(() => 'done'), deadline]);
    if (outcome === 'timeout') {
      // degradation-audit: reported - the turn still runs on the current setting of the session.
      logger.warn(
        `RPC: chat:continue - applying the ${what} to the live session timed out`,
        { ...context, timeoutMs: LIVE_TURN_SETTINGS_TIMEOUT_MS },
      );
    }
  } catch (error) {
    // degradation-audit: reported - the turn still runs on the current setting of the session.
    logger.warn(
      `RPC: chat:continue - could not apply the ${what} to the live session`,
      {
        ...context,
        error: error instanceof Error ? error.message : String(error),
      },
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Apply the model and effort of the sending tab to a session that is already
 * live, before the turn is sent.
 *
 * A live session ignores `model` and `effort` of `chat:continue`: only a cold
 * resume reads them. Without this call, a model that the user picked in the
 * dropdown, or that a parent session pinned for a child, would reach the next
 * turn only after the session restarts.
 *
 * The adapter ignores a value that the session already uses. A failure or a
 * timeout does not stop the turn. The session keeps its current settings and
 * the turn runs. The two calls run at the same time.
 */
export async function applyLiveTurnSettings(
  adapter: Pick<IAgentAdapter, 'setSessionModel' | 'setSessionEffort'>,
  logger: Logger,
  sessionId: SessionId,
  settings: LiveTurnSettings,
): Promise<void> {
  const { model, effort } = settings;
  const jobs: Promise<void>[] = [];
  if (model) {
    jobs.push(
      applyOne(logger, 'model', { sessionId, model }, () =>
        adapter.setSessionModel(sessionId, model),
      ),
    );
  }
  if (effort) {
    jobs.push(
      applyOne(logger, 'effort', { sessionId, effort }, () =>
        adapter.setSessionEffort(sessionId, effort),
      ),
    );
  }
  await Promise.all(jobs);
}
