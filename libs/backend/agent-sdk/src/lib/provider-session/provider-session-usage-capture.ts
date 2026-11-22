/**
 * Durable usage of the provider-session main chat (Antigravity, Grok,
 * OpenCode). Each completed turn with usage becomes one `'provider-session'`
 * contribution to the optional `SessionUsageSink`, so the session's totals
 * and the usage dashboard survive a restart. A resumed session reads the
 * persisted totals back to seed its `ProviderSessionUsageLedger`.
 *
 * Best effort on both sides: a missing sink, a rejected contribution or a
 * failed read is logged and never fails the turn or the resume.
 */
import type { Logger } from '@ptah-extension/vscode-core';
import type { ProviderUsage } from '@ptah-extension/provider-session-contracts';
import { normalizeWorkspaceRoot } from '@ptah-extension/shared';
import {
  parseSessionUsageContribution,
  usdToMicroUsd,
  type SessionUsageSink,
} from '../session-stats/session-usage-sink';
import type { IPricingProvider } from '../pricing.port';
import type {
  ProviderSessionTurnUsage,
  ProviderSessionUsageSeed,
} from './provider-session-usage-ledger';

/** The ingestion boundary these rows are written under. */
export const PROVIDER_SESSION_USAGE_PRODUCER = 'provider-session';

/**
 * A persisted-totals read longer than this resumes without a seed. Resume is
 * not latency critical and the read waits behind the sink's write queue, so
 * the bound is generous. A timeout costs only this process's seed: nothing
 * persisted changes, and the next resume reads every turn again.
 */
const RESTORE_TIMEOUT_MS = 15_000;

/** The longest a turn's pricing waits for the runtime price catalog, once. */
const PRICING_WAIT_MS = 3_000;

/** What one completed turn needs to become a contribution. */
export interface ProviderSessionUsageTurn {
  readonly sessionId: string;
  readonly providerId: string;
  readonly workspacePath?: string;
  readonly turnId?: string;
  readonly model?: string;
  readonly usage: ProviderUsage;
  readonly recorded: ProviderSessionTurnUsage;
  readonly startedAtMs: number;
  readonly endedAtMs: number;
}

/** The contribution of one completed turn, before boundary validation. */
export function providerSessionUsageContribution(
  turn: ProviderSessionUsageTurn,
): Record<string, unknown> {
  const { turnPrice } = turn.recorded;
  const knownCostMicroUsd =
    turnPrice.totalCost === null ? null : usdToMicroUsd(turnPrice.totalCost);
  const costAuthority =
    knownCostMicroUsd === null
      ? 'unpriced'
      : turnPrice.costBasis === 'reported'
        ? 'provider-reported'
        : 'model-priced';
  const pricingVersion = turnPrice.priceProvenance?.catalogVersion;
  return {
    sessionId: turn.sessionId,
    producer: PROVIDER_SESSION_USAGE_PRODUCER,
    executorType: 'session',
    runId: turn.recorded.runId,
    turnId: turn.turnId ? turn.turnId : null,
    // Unique per turn of this run; a replay of the same turn reuses it.
    eventKey: `${turn.recorded.runId}#${turn.recorded.runTurn}`,
    parentSessionId: null,
    subagentId: null,
    providerId: turn.providerId,
    occurredAtMs: turn.endedAtMs,
    revision: turn.recorded.revision,
    models: [
      {
        modelId: turn.model ? turn.model : null,
        inputTokens: turn.usage.inputTokens,
        outputTokens: turn.usage.outputTokens,
        cacheReadTokens: turn.usage.cacheReadTokens ?? 0,
        cacheCreationTokens: turn.usage.cacheWriteTokens ?? 0,
        knownCostMicroUsd,
        costAuthority,
      },
    ],
    totalCostMicroUsd: knownCostMicroUsd,
    totalCostAuthority: costAuthority,
    pricingVersion: pricingVersion ? pricingVersion : null,
    // Fallback only: the sessions row's workspace key wins in every read.
    ...(turn.workspacePath
      ? { workspaceKey: normalizeWorkspaceRoot(turn.workspacePath) }
      : {}),
    source: 'live',
    coverageStartMs: Math.min(turn.startedAtMs, turn.endedAtMs),
    coverageEndMs: turn.endedAtMs,
  };
}

export interface ProviderSessionUsagePersistence {
  /** Persist one completed turn. Never throws. */
  record(turn: ProviderSessionUsageTurn): void;
  /** Persisted totals of a resumed session; `null` when none or unreadable. */
  restore(sessionId: string): Promise<ProviderSessionUsageSeed | null>;
}

export function createProviderSessionUsagePersistence(
  sink: SessionUsageSink | null | undefined,
  logger: Pick<Logger, 'warn' | 'error'>,
  restoreTimeoutMs = RESTORE_TIMEOUT_MS,
): ProviderSessionUsagePersistence {
  return {
    record(turn) {
      if (!sink) return;
      try {
        const contribution = parseSessionUsageContribution(
          providerSessionUsageContribution(turn),
        );
        if (contribution === null) {
          logger.warn(
            '[ProviderSessionChatAdapter] Usage contribution rejected at the capture boundary',
            { sessionId: turn.sessionId },
          );
          return;
        }
        void Promise.resolve(sink.recordUsage(contribution)).catch(
          (error: unknown) => {
            logger.error(
              '[ProviderSessionChatAdapter] Usage capture failed',
              error instanceof Error ? error : new Error(String(error)),
            );
          },
        );
      } catch (error: unknown) {
        // degradation-audit: reported - persistence never breaks the turn
        // it observed; the in-memory snapshot is already delivered.
        logger.error(
          '[ProviderSessionChatAdapter] Usage capture failed; the turn is unaffected',
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    },
    async restore(sessionId) {
      if (!sink) return null;
      try {
        // A resumed session is live again: reopen a finalized stats row.
        void Promise.resolve(sink.resumeSession?.(sessionId)).catch(
          (error: unknown) => {
            logger.error(
              '[ProviderSessionChatAdapter] Usage ledger reopen failed',
              error instanceof Error ? error : new Error(String(error)),
            );
          },
        );
        if (!sink.readSessionUsage) return null;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<'timeout'>((resolve) => {
          timer = setTimeout(() => resolve('timeout'), restoreTimeoutMs);
          timer.unref?.();
        });
        const reading = Promise.resolve(
          sink.readSessionUsage(sessionId, PROVIDER_SESSION_USAGE_PRODUCER),
        );
        let timedOut = false;
        // A read that fails after the timeout won is reported here; one that
        // fails before it reaches the outer catch.
        reading.catch((error: unknown) => {
          if (!timedOut) return;
          logger.warn('[ProviderSessionChatAdapter] Persisted usage read failed after its timeout', {
            sessionId,
            error: error instanceof Error ? error.message : 'unknown',
          });
        });
        try {
          const read = await Promise.race([reading, timeout]);
          if (read === 'timeout') {
            timedOut = true;
            logger.warn(
              '[ProviderSessionChatAdapter] Persisted usage read timed out; totals restart from this turn',
              { sessionId },
            );
            return null;
          }
          return read;
        } finally {
          clearTimeout(timer);
        }
      } catch (error: unknown) {
        // degradation-audit: reported - an unreadable ledger resumes the
        // session with partial coverage, exactly as before persistence.
        logger.error(
          '[ProviderSessionChatAdapter] Persisted usage read failed; totals restart from this turn',
          error instanceof Error ? error : new Error(String(error)),
        );
        return null;
      }
    },
  };
}

/**
 * The first priced turn waits for the OpenRouter catalog warmup (bounded),
 * so a turn that ends right after boot is not priced against the bundled
 * table alone. The wait settles once; later turns never wait again.
 */
export function createPricingGate(
  pricing: Pick<IPricingProvider, 'ensureHydrated'> | null | undefined,
  logger: Pick<Logger, 'warn'>,
): () => Promise<void> {
  let wait: Promise<void> | undefined;
  const report = (error: unknown) => {
    logger.warn('[ProviderSessionChatAdapter] price catalog wait failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });
  };
  return () => {
    if (!pricing) return Promise.resolve();
    wait ??= new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, PRICING_WAIT_MS);
      timer.unref?.();
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      try {
        pricing.ensureHydrated().then(done, (error: unknown) => {
          // Documented never to reject; a failed warmup prices against the
          // bundled table.
          report(error);
          done();
        });
      } catch (error: unknown) {
        // degradation-audit: reported - same as above, thrown synchronously.
        report(error);
        done();
      }
    });
    return wait;
  };
}
