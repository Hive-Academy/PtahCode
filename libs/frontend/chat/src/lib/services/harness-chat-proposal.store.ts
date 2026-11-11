import { Injectable, type Provider, inject, signal } from '@angular/core';
import {
  ClaudeRpcService,
  LoggingService,
  MESSAGE_HANDLERS,
  type MessageHandler,
} from '@ptah-extension/core';
import { HarnessHealthStore } from '@ptah-extension/marketplace/services';
import {
  MESSAGE_TYPES,
  mergeHarnessConfigUpdates,
  type HarnessConfig,
} from '@ptah-extension/shared';
import {
  IDLE_HARNESS_APPLY_STATE,
  buildFullHarnessConfig,
  extractReadableErrorMessage,
  fingerprintHarnessConfig,
  hasMeaningfulHarnessProposal,
  mergeParsedHarnessUpdates,
  type HarnessProposalApplyState,
  type HarnessProposalRecord,
} from './harness-chat-proposal.helpers';

export {
  IDLE_HARNESS_APPLY_STATE,
  buildFullHarnessConfig,
  fingerprintHarnessConfig,
  hasMeaningfulHarnessProposal,
  summarizeHarnessProposal,
  type HarnessProposalApplyState,
  type HarnessProposalRecord,
  type HarnessProposalSummary,
} from './harness-chat-proposal.helpers';

const APPLY_TIMEOUT_MS = 60_000;
const GET_PROPOSAL_TIMEOUT_MS = 15_000;
const APPLY_ERROR_FALLBACK =
  'Could not apply the harness configuration. Please try again.';

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * HarnessChatProposalStore — session-scoped state for harness proposals in chat.
 *
 * Replaces the retired Harness Builder split-pane sidebar (Decision D1):
 * - Subscribes to `MESSAGE_TYPES.HARNESS_CONFIG_PROPOSED` via `MESSAGE_HANDLERS`
 *   and stores folded `Partial<HarnessConfig>` proposals keyed by `sessionId`.
 * - Hydrates persisted proposals on session bind/re-open via `harness:get-proposal`.
 * - Applies a session's proposal via `harness:apply` (`outputFormat: 'claude-md'`)
 *   and triggers `HarnessHealthStore.refresh({ refresh: true })`.
 */
@Injectable({ providedIn: 'root' })
export class HarnessChatProposalStore implements MessageHandler {
  private readonly rpc = inject(ClaudeRpcService);
  private readonly logger = inject(LoggingService);
  private readonly healthStore = inject(HarnessHealthStore);

  private readonly _proposals = signal<
    ReadonlyMap<string, HarnessProposalRecord>
  >(new Map());
  private readonly _applyStates = signal<
    ReadonlyMap<string, HarnessProposalApplyState>
  >(new Map());

  private pendingQueue: Promise<void> = Promise.resolve();
  private readonly inFlightHydrations = new Map<string, Promise<void>>();
  private readonly pushVersions = new Map<string, number>();

  readonly handledMessageTypes = [
    MESSAGE_TYPES.HARNESS_CONFIG_PROPOSED,
  ] as const;

  /** Read-only map of proposals keyed by `sessionId`. */
  readonly proposals = this._proposals.asReadonly();
  /** Read-only map of apply lifecycle states keyed by `sessionId`. */
  readonly applyStates = this._applyStates.asReadonly();

  /** Reactive lookup for `sessionId`'s meaningful proposal, or `null` when absent. */
  proposalFor(
    sessionId: string | null | undefined,
  ): HarnessProposalRecord | null {
    const trimmed = sessionId?.trim();
    if (!trimmed) return null;
    const record = this._proposals().get(trimmed) ?? null;
    if (!record || !hasMeaningfulHarnessProposal(record.configUpdates)) {
      return null;
    }
    return record;
  }

  /** Reactive lookup for `sessionId`'s apply status. */
  applyStateFor(
    sessionId: string | null | undefined,
  ): HarnessProposalApplyState {
    const trimmed = sessionId?.trim();
    if (!trimmed) return IDLE_HARNESS_APPLY_STATE;
    return this._applyStates().get(trimmed) ?? IDLE_HARNESS_APPLY_STATE;
  }

  /** Clear any recorded apply error for `sessionId` back to `idle`. */
  clearApplyError(sessionId: string | null | undefined): void {
    const trimmed = sessionId?.trim();
    if (!trimmed) return;
    if (this._applyStates().get(trimmed)?.status === 'error') {
      this.setApplyState(trimmed, IDLE_HARNESS_APPLY_STATE);
    }
  }

  handleMessage(message: { type: string; payload?: unknown }): Promise<void> {
    if (message.type !== MESSAGE_TYPES.HARNESS_CONFIG_PROPOSED) {
      return this.pendingQueue;
    }
    this.pendingQueue = this.pendingQueue
      .then(() => this.consumeProposalPush(message.payload))
      .catch((cause: unknown) => {
        const err = cause instanceof Error ? cause : new Error(String(cause));
        this.logError('Failed to handle harness:config-proposed push', err);
      });
    return this.pendingQueue;
  }

  /** Hydrate any persisted proposal for `sessionId` via `harness:get-proposal`. */
  hydrateForSession(sessionId: string, workspaceRoot?: string): Promise<void> {
    const trimmedId = sessionId.trim();
    if (!trimmedId) return Promise.resolve();

    const inflightKey = `${trimmedId}::${workspaceRoot ?? ''}`;
    const existing = this.inFlightHydrations.get(inflightKey);
    if (existing) return existing;

    const run = this.performHydration(trimmedId, workspaceRoot).finally(() => {
      this.inFlightHydrations.delete(inflightKey);
    });
    this.inFlightHydrations.set(inflightKey, run);
    return run;
  }

  /** Apply `sessionId`'s staged proposal to `workspaceRoot` via `harness:apply`. */
  async applyProposal(
    sessionId: string,
    workspaceRoot?: string,
  ): Promise<boolean> {
    const trimmedId = sessionId.trim();
    const record = this.proposalFor(trimmedId);
    if (!record) return false;
    if (this.applyStateFor(trimmedId).status === 'applying') return false;

    this.setApplyState(trimmedId, { status: 'applying' });

    const effectiveWorkspaceRoot =
      workspaceRoot?.trim() || record.workspaceRoot;
    const config = buildFullHarnessConfig(
      record.configUpdates,
      effectiveWorkspaceRoot,
    );

    try {
      const result = await this.rpc.call(
        'harness:apply',
        {
          config,
          outputFormat: 'claude-md',
          ...(effectiveWorkspaceRoot
            ? { workspaceRoot: effectiveWorkspaceRoot }
            : {}),
        },
        { timeout: APPLY_TIMEOUT_MS },
      );

      if (result.isSuccess() && result.data) {
        const appliedFingerprint = fingerprintHarnessConfig(
          record.configUpdates,
        );
        const current = this.proposalFor(trimmedId);
        // A newer revision arrived while the apply was in flight: the new
        // proposal was not written, so the banner must not report it applied.
        if (
          current &&
          fingerprintHarnessConfig(current.configUpdates) !== appliedFingerprint
        ) {
          this.setApplyState(trimmedId, IDLE_HARNESS_APPLY_STATE);
        } else {
          this.setApplyState(trimmedId, {
            status: 'applied',
            appliedCount: result.data.appliedPaths.length,
            warnings: result.data.warnings,
            appliedConfigFingerprint: appliedFingerprint,
          });
        }
        void this.healthStore.refresh({ refresh: true });
        return true;
      }

      const errorMessage = extractReadableErrorMessage(
        result.error,
        APPLY_ERROR_FALLBACK,
      );
      this.logError(
        'harness:apply returned an error result',
        new Error(errorMessage),
      );
      this.setApplyState(trimmedId, { status: 'error', errorMessage });
      return false;
    } catch (cause: unknown) {
      const err = cause instanceof Error ? cause : new Error(String(cause));
      if (typeof this.logger.error === 'function') {
        this.logger.error(
          'HarnessChatProposalStore',
          'harness:apply threw an unexpected error',
          err,
        );
      } else {
        this.logger.warn(
          'HarnessChatProposalStore',
          'harness:apply threw an unexpected error',
          err,
        );
      }
      const errorMessage = extractReadableErrorMessage(
        cause,
        APPLY_ERROR_FALLBACK,
      );
      this.setApplyState(trimmedId, { status: 'error', errorMessage });
      return false;
    }
  }

  private async consumeProposalPush(payload: unknown): Promise<void> {
    if (!isPlainRecord(payload)) {
      this.logger.warn(
        'HarnessChatProposalStore',
        'Dropped non-object harness:config-proposed payload',
      );
      return;
    }

    const { HarnessConfigUpdatesSchema, HarnessSessionIdSchema } =
      await import('@ptah-extension/shared/schemas');

    const sessionParsed = HarnessSessionIdSchema.safeParse(
      payload['sessionId'],
    );
    const updatesParsed = HarnessConfigUpdatesSchema.safeParse(
      payload['configUpdates'],
    );
    if (!sessionParsed.success || !updatesParsed.success) {
      this.logger.warn(
        'HarnessChatProposalStore',
        'Dropped invalid harness:config-proposed payload',
      );
      return;
    }

    const sessionId = sessionParsed.data;
    this.pushVersions.set(
      sessionId,
      (this.pushVersions.get(sessionId) ?? 0) + 1,
    );

    const previous = this._proposals().get(sessionId);
    const mergedUpdates = mergeParsedHarnessUpdates(
      previous?.configUpdates ?? {},
      updatesParsed.data,
    );

    const revisionRecord = isPlainRecord(payload['revision'])
      ? payload['revision']
      : null;
    const rawComplete =
      typeof payload['isConfigComplete'] === 'boolean'
        ? payload['isConfigComplete']
        : typeof revisionRecord?.['isConfigComplete'] === 'boolean'
          ? revisionRecord['isConfigComplete']
          : (previous?.isConfigComplete ?? false);
    const updatedAt =
      typeof revisionRecord?.['updatedAt'] === 'string'
        ? revisionRecord['updatedAt']
        : new Date().toISOString();

    this.upsertProposal(sessionId, {
      sessionId,
      ...(previous?.workspaceRoot
        ? { workspaceRoot: previous.workspaceRoot }
        : {}),
      configUpdates: mergedUpdates,
      isConfigComplete: rawComplete,
      updatedAt,
    });
  }

  private async performHydration(
    sessionId: string,
    workspaceRoot?: string,
  ): Promise<void> {
    const versionBefore = this.pushVersions.get(sessionId) ?? 0;
    try {
      const result = await this.rpc.call(
        'harness:get-proposal',
        {
          sessionId,
          ...(workspaceRoot ? { workspaceRoot } : {}),
        },
        { timeout: GET_PROPOSAL_TIMEOUT_MS },
      );
      if (!result.isSuccess() || !result.data?.proposal) {
        return;
      }

      const { HarnessConfigUpdatesSchema, HarnessProposalSchema } =
        await import('@ptah-extension/shared/schemas');
      const parsedProposal = HarnessProposalSchema.safeParse(
        result.data.proposal,
      );
      if (!parsedProposal.success) {
        this.logger.warn(
          'HarnessChatProposalStore',
          'Dropped malformed proposal returned by harness:get-proposal',
        );
        return;
      }

      const proposal = parsedProposal.data;
      const normalizedUpdates = HarnessConfigUpdatesSchema.safeParse(
        proposal.configUpdates,
      );
      let hydratedUpdates: Partial<HarnessConfig> = normalizedUpdates.success
        ? mergeParsedHarnessUpdates({}, normalizedUpdates.data)
        : proposal.configUpdates;

      const versionAfter = this.pushVersions.get(sessionId) ?? 0;
      const liveRecord = this._proposals().get(sessionId);
      const pushArrivedWhileHydrating = versionAfter !== versionBefore;

      // The live record wins when it is newer; completeness follows the
      // same revision as the configuration.
      const liveWins =
        liveRecord !== undefined &&
        (pushArrivedWhileHydrating ||
          liveRecord.updatedAt > proposal.updatedAt);
      if (liveRecord && liveWins) {
        hydratedUpdates = mergeHarnessConfigUpdates(
          hydratedUpdates,
          liveRecord.configUpdates,
        );
      }

      this.upsertProposal(sessionId, {
        sessionId,
        workspaceRoot: workspaceRoot ?? proposal.workspaceRoot,
        configUpdates: hydratedUpdates,
        isConfigComplete:
          liveRecord && liveWins
            ? liveRecord.isConfigComplete
            : proposal.isConfigComplete,
        updatedAt:
          liveRecord && liveRecord.updatedAt > proposal.updatedAt
            ? liveRecord.updatedAt
            : proposal.updatedAt,
      });
    } catch (cause: unknown) {
      const err = cause instanceof Error ? cause : new Error(String(cause));
      this.logError('Failed to hydrate harness proposal for session', err);
    }
  }

  private upsertProposal(
    sessionId: string,
    nextRecord: HarnessProposalRecord,
  ): void {
    this._proposals.update((prev) => {
      const copy = new Map(prev);
      copy.set(sessionId, nextRecord);
      return copy;
    });

    const currentApply = this._applyStates().get(sessionId);
    if (!currentApply) return;
    if (currentApply.status === 'error') {
      this.setApplyState(sessionId, IDLE_HARNESS_APPLY_STATE);
      return;
    }
    if (
      currentApply.status === 'applied' &&
      currentApply.appliedConfigFingerprint !==
        fingerprintHarnessConfig(nextRecord.configUpdates)
    ) {
      this.setApplyState(sessionId, IDLE_HARNESS_APPLY_STATE);
    }
  }

  private setApplyState(
    sessionId: string,
    state: HarnessProposalApplyState,
  ): void {
    this._applyStates.update((prev) => {
      const copy = new Map(prev);
      copy.set(sessionId, state);
      return copy;
    });
  }

  private logError(message: string, err: Error): void {
    if (typeof this.logger.error === 'function') {
      this.logger.error('HarnessChatProposalStore', message, err);
    } else {
      this.logger.warn('HarnessChatProposalStore', message, err);
    }
  }
}

/**
 * Registers `HarnessChatProposalStore` in `MESSAGE_HANDLERS` at app bootstrap
 * so `harness:config-proposed` broadcasts are captured even before a chat view mounts.
 */
export function provideHarnessChatProposalStore(): Provider[] {
  return [
    {
      provide: MESSAGE_HANDLERS,
      useExisting: HarnessChatProposalStore,
      multi: true,
    },
  ];
}
