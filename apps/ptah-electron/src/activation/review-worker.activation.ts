import { REVIEW_CORE_TOKENS, type ReviewOrchestratorService } from '@ptah-extension/review-core';
import type { Logger } from '@ptah-extension/vscode-core';
import type { DependencyContainer } from 'tsyringe';
import { REVIEW_SYNC_TOKENS, type ReviewSyncScheduleService } from '../services/review/review-sync-schedule.service';

export interface ReviewWorkerHandle { dispose(): void; awaitStopped(): Promise<void> }

/** Recovers startup state, binds the review sync job, then drains the durable queue independently. */
export async function startReviewWorker(
  container: DependencyContainer,
  signal: AbortSignal,
  logger: Pick<Logger, 'error'>,
): Promise<ReviewWorkerHandle | null> {
  if (signal.aborted || !container.isRegistered(REVIEW_CORE_TOKENS.ORCHESTRATOR)) return null;
  const orchestrator = container.resolve<ReviewOrchestratorService>(REVIEW_CORE_TOKENS.ORCHESTRATOR);
  const schedule = container.resolve<ReviewSyncScheduleService>(REVIEW_SYNC_TOKENS.SCHEDULE);
  // Recovery runs before the schedule binds, so a tick cannot sync rows that recovery still owns.
  await schedule.recoverStartup(signal);
  // An abort during recovery already fired; a listener added now would never run dispose.
  if (signal.aborted) return null;
  const registration = schedule.register();
  let disposed = false;
  let draining = false;
  let activeDrain: Promise<void> | null = null;
  const drainController = new AbortController();
  const owner = `electron-review-${process.pid}-${Date.now()}`;
  const drain = (): void => {
    if (disposed || signal.aborted || draining) return;
    draining = true;
    activeDrain = orchestrator.drain(owner, Date.now() + 60_000, drainController.signal).then(() => undefined).catch((_error: unknown) => {
      logger.error('Review queue drain failed', new Error('Review queue drain failed'));
    }).finally(() => { draining = false; activeDrain = null; });
  };
  const timer = setInterval(drain, 30_000);
  timer.unref();
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    drainController.abort();
    clearInterval(timer);
    signal.removeEventListener('abort', dispose);
    registration.dispose();
  };
  signal.addEventListener('abort', dispose, { once: true });
  drain();
  // Detached: removing ended attempts' checkouts (GBs each) must not delay reviews. It touches
  // only ended attempts, so it is safe beside the drain. An interrupted sweep repeats next start.
  void orchestrator.releaseEndedSources().catch((_error: unknown) => {
    logger.error('Review attempt source sweep failed', new Error('Review attempt source sweep failed'));
  });
  return { dispose, awaitStopped: () => activeDrain ?? Promise.resolve() };
}

