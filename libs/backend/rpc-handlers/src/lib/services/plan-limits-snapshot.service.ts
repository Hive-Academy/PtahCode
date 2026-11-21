/**
 * PlanLimitsSnapshotService — assembles the `PlanLimitsSnapshot` that both
 * `provider:getPlanLimits` and the `planLimits:changed` push carry
 * (TASK_2026_596, Component 12; Decision 7).
 *
 * ## Owners
 *
 * `PlanLimitOwnerDiscoveryService.discoverTargets` names the owners. Each
 * entry is either:
 * - `read` — read through `PlanUsageService.getOwnerSnapshot(target)`, every
 *   owner in parallel, each under its provider's `limitLookupDeadlineMs`
 *   (3 s, or 12 s for Codex and Antigravity cold starts). A read that misses
 *   it is cancelled and the owner is still
 *   listed, as `service-unavailable` with the ledger's evidence;
 * - `known` — the snapshot is already complete and is passed through
 *   unchanged. It is never read.
 *
 * Discovery and all parallel owner reads share one 24-second ceiling. Slow
 * owners still appear with ledger evidence when that ceiling expires.
 *
 * The single-owner lookup behind `provider:getAccountUsage`
 * (`ownerSnapshotForProvider`) is the exception: it reads without that
 * deadline, so the reader's own time limit applies.
 *
 * ## The push uses the last request
 *
 * The push has no caller, so it repeats the scope of the most recent
 * `provider:getPlanLimits` call (provider, sessions, owner keys) without a
 * refresh. A push therefore lists the same owners the view last asked for and
 * can replace the view's snapshot as a whole.
 *
 * ## No secret crosses this boundary (F71)
 *
 * A read target names where its credential lives; the target itself is never
 * placed in the result. Only owner snapshots (hashed owner key, generic label)
 * and session owner keys are returned. A failed read is logged with its error
 * name only, never its message, which may quote a response body or a path.
 */
import { inject, injectable } from 'tsyringe';
import { createHash } from 'node:crypto';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import { SDK_TOKENS } from '@ptah-extension/agent-sdk';
import {
  AUTH_PROVIDERS_TOKENS,
  type ProviderOwnerResolver,
  type PlanLimitLedgerService,
  type PlanOwnerTarget,
  type PlanUsageService,
} from '@ptah-extension/auth-providers';
import {
  CLI_AGENT_RUNTIME_TOKENS,
  type DiscoveredPlanOwner,
  type PlanLimitOwnerDiscoveryService,
  type PlanOwnerDiscoveryRequest,
  type SelectedProviderDiscovery,
} from '@ptah-extension/cli-agent-runtime';
import {
  limitLookupDeadlineMs,
  SLOW_LIMIT_LOOKUP_DEADLINE_MS,
  type PlanLimitOwnerSnapshot,
  type PlanLimitSessionOwner,
  type PlanLimitsSnapshot,
  type ProviderSessionProfileId,
  type QuotaOwnerRef,
  type SessionRuntimeIdentity,
} from '@ptah-extension/shared';

/** The scope of one snapshot: what the view asked for. */
export interface PlanLimitsSnapshotRequest {
  readonly providerId?: string;
  readonly sessionIds?: readonly string[];
  readonly ownerKeys?: readonly string[];
  readonly refresh?: boolean;
}

export type PlanLimitsDiscovery = Pick<
  PlanLimitOwnerDiscoveryService,
  'discoverTargets' | 'discoverSelectedProvider'
>;
export type ProviderOwnerSnapshot =
  | { readonly kind: 'snapshot'; readonly snapshot: PlanLimitOwnerSnapshot }
  | { readonly kind: 'no-owner' }
  | { readonly kind: 'unavailable' };
export type PlanLimitsUsage = Pick<PlanUsageService, 'getOwnerSnapshot'>;
export type PlanLimitsLedgerReader = Pick<
  PlanLimitLedgerService,
  'snapshotFor' | 'sessionOwners'
>;
interface NativeSessionMetadata {
  get(sessionId: string): Promise<{
    codexExecution?: SessionRuntimeIdentity;
    providerSessionExecution?: SessionRuntimeIdentity;
  } | null>;
}
type CodexHomeOwnerResolver = Pick<ProviderOwnerResolver, 'ownerForCodexHome'>;
/** Leaves six seconds for RPC transport and rendering (30 second client timeout). */
const SNAPSHOT_BUDGET_MS = 24_000;
const PLAN_LIMITS_SNAPSHOT_TTL_MS = 30_000;
const MAX_SNAPSHOT_KEYS = 32;
const RESERVED_READ_MS = SLOW_LIMIT_LOOKUP_DEADLINE_MS;
type AssembledSnapshot = {
  snapshot: PlanLimitsSnapshot;
  discoveryMs: number;
  readsMs: number;
  cacheable: boolean;
};

@injectable()
export class PlanLimitsSnapshotService {
  private readonly pendingSnapshots = new Map<string, Promise<AssembledSnapshot>>();
  private readonly cachedSnapshots = new Map<string, { result: AssembledSnapshot; expiresAt: number }>();
  private readonly latestCacheAssembly = new Map<string, symbol>();
  private pulls = 0;
  private joins = 0;
  private pushes = 0;
  /** Scope of the most recent RPC request; the push repeats it. */
  private lastRequest: PlanOwnerDiscoveryRequest = {};

  constructor(
    @inject(TOKENS.LOGGER) private readonly logger: Logger,
    @inject(CLI_AGENT_RUNTIME_TOKENS.PLAN_LIMIT_OWNER_DISCOVERY)
    private readonly discovery: PlanLimitsDiscovery,
    @inject(AUTH_PROVIDERS_TOKENS.PLAN_USAGE_SERVICE)
    private readonly usage: PlanLimitsUsage,
    @inject(AUTH_PROVIDERS_TOKENS.PLAN_LIMIT_LEDGER)
    private readonly ledger: PlanLimitsLedgerReader,
    @inject(SDK_TOKENS.SDK_SESSION_METADATA_STORE, { isOptional: true })
    private readonly metadata?: NativeSessionMetadata,
    @inject(AUTH_PROVIDERS_TOKENS.PROVIDER_OWNER_RESOLVER, { isOptional: true })
    private readonly ownerResolver?: CodexHomeOwnerResolver,
  ) {}

  protected now(): number { return Date.now(); }

  /**
   * The snapshot for an RPC request. Its scope (not `refresh`) becomes the
   * scope of later pushes. An owner read failure never rejects. A discovery
   * failure rejects and is not cached.
   *
   * A complete pull is cached for 30 s per scope. The cache has no
   * invalidation hook: a credential change or a session that opens inside the
   * TTL shows on the next push, on `refresh: true`, or after the TTL.
   */
  async snapshot(
    request: PlanLimitsSnapshotRequest,
  ): Promise<PlanLimitsSnapshot> {
    const started = this.now();
    this.pulls += 1;
    const scope = discoveryRequest(request);
    this.lastRequest = scope;
    const key = scopeKey(scope, request.refresh === true);
    const existing = this.pendingSnapshots.get(key);
    if (existing) {
      this.joins += 1;
      const result = await existing;
      this.logSnapshot('pull', 'joined', key, scope, request.refresh === true, started, result);
      return result.snapshot;
    }
    const cacheKey = scopeKey(scope, false);
    if (request.refresh !== true) {
      const cached = this.cachedSnapshots.get(cacheKey);
      if (cached && this.now() < cached.expiresAt) {
        // Re-insert on a hit so that the 32-key bound evicts the least recent.
        this.cachedSnapshots.delete(cacheKey);
        this.cachedSnapshots.set(cacheKey, cached);
        this.logSnapshot('pull', 'ttl-cache', key, scope, false, started, cached.result);
        return cached.result.snapshot;
      }
      if (cached) this.cachedSnapshots.delete(cacheKey);
    }
    const cacheAssembly = Symbol();
    this.latestCacheAssembly.set(cacheKey, cacheAssembly);
    const pending = this.assemble(scope, request.refresh === true);
    // Bound retained keys even when callers submit many distinct scopes.
    if (this.pendingSnapshots.size >= MAX_SNAPSHOT_KEYS) {
      const oldest = this.pendingSnapshots.keys().next().value;
      if (oldest !== undefined) this.pendingSnapshots.delete(oldest);
    }
    this.pendingSnapshots.set(key, pending);
    void pending.then(
      () => { if (this.pendingSnapshots.get(key) === pending) this.pendingSnapshots.delete(key); },
      () => { if (this.pendingSnapshots.get(key) === pending) this.pendingSnapshots.delete(key); },
    );
    try {
      const result = await pending;
      if (this.latestCacheAssembly.get(cacheKey) === cacheAssembly) {
        if (!result.cacheable) {
          this.cachedSnapshots.delete(cacheKey);
        } else {
          this.cachedSnapshots.delete(cacheKey);
          if (this.cachedSnapshots.size >= MAX_SNAPSHOT_KEYS) {
            const oldest = this.cachedSnapshots.keys().next().value;
            if (oldest !== undefined) this.cachedSnapshots.delete(oldest);
          }
          this.cachedSnapshots.set(cacheKey, {
            result, expiresAt: this.now() + PLAN_LIMITS_SNAPSHOT_TTL_MS,
          });
        }
      }
      this.logSnapshot('pull', 'assembled', key, scope, request.refresh === true, started, result);
      return result.snapshot;
    } finally {
      if (this.latestCacheAssembly.get(cacheKey) === cacheAssembly) {
        this.latestCacheAssembly.delete(cacheKey);
      }
    }
  }

  /** The snapshot for a push: the last request's scope, cached reads. */
  async currentSnapshot(): Promise<PlanLimitsSnapshot> {
    const started = this.now();
    this.pushes += 1;
    const scope = this.lastRequest;
    const key = scopeKey(scope, false);
    const result = await this.assemble(scope, false);
    this.logSnapshot('push', 'assembled', key, scope, false, started, result);
    return result.snapshot;
  }

  private logSnapshot(
    source: 'pull' | 'push', path: 'joined' | 'assembled' | 'ttl-cache', key: string,
    scope: PlanOwnerDiscoveryRequest, refresh: boolean, started: number,
    result: AssembledSnapshot,
  ): void {
    this.logger.debug('[PlanLimitsSnapshot] snapshot served', {
      source, path, scopeId: createHash('sha256').update(key).digest('hex').slice(0, 8),
      hasProvider: scope.selectedProviderId !== undefined,
      sessionCount: scope.sessionIds?.length ?? 0,
      ownerKeyCount: scope.ownerKeys?.length ?? 0,
      refresh, durationMs: this.now() - started,
      discoveryMs: result.discoveryMs, readsMs: result.readsMs,
      owners: result.snapshot.owners.length,
      discoveryIncomplete: result.snapshot.discoveryIncomplete,
      pulls: this.pulls, joins: this.joins, pushes: this.pushes,
    });
  }

  /**
   * The snapshot of the owner the given provider's route resolves to, or
   * `undefined` when the route names no owner. Does not change the push
   * scope. Never rejects.
   *
   * The read carries no {@link LIMIT_LOOKUP_DEADLINE_MS} deadline: this one
   * owner is what the caller asked for, so its reader's own time limit
   * applies (a Codex cold start may take up to 10 s, Req 2.10).
   */
  async ownerSnapshotForProvider(
    providerId: string,
    refresh: boolean,
  ): Promise<ProviderOwnerSnapshot> {
    const result: SelectedProviderDiscovery =
      await this.discovery.discoverSelectedProvider(providerId);
    if (result.kind === 'unavailable') return result;
    if (!result.entry) return { kind: 'no-owner' };
    return {
      kind: 'snapshot',
      snapshot: await this.ownerSnapshot(result.entry, refresh, false),
    };
  }

  // ---------------------------------------------------------------- helpers

  private async assemble(
    scope: PlanOwnerDiscoveryRequest,
    refresh: boolean,
  ): Promise<AssembledSnapshot> {
    const deadlineAt = this.now() + SNAPSHOT_BUDGET_MS;
    const discoveryStarted = this.now();
    const entries = await this.discovery.discoverTargets(scope, deadlineAt - RESERVED_READ_MS);
    const discoveryMs = this.now() - discoveryStarted;
    const readsStarted = this.now();
    let cacheable = entries.discoveryIncomplete !== true;
    const owners = await Promise.all(
      entries.map((entry) => this.ownerSnapshot(entry, refresh, true, deadlineAt, () => { cacheable = false; })),
    );
    const readsMs = this.now() - readsStarted;
    return { discoveryMs, readsMs, cacheable, snapshot: {
      generatedAt: this.now(),
      owners,
      discoveryIncomplete: entries.discoveryIncomplete === true,
      sessionOwners: await this.sessionOwners(scope.sessionIds ?? [], owners),
    } };
  }

  private async ownerSnapshot(
    entry: DiscoveredPlanOwner,
    refresh: boolean,
    withDeadline: boolean,
    deadlineAt?: number,
    onFallback?: () => void,
  ): Promise<PlanLimitOwnerSnapshot> {
    if (entry.kind === 'known') return entry.snapshot;
    const snapshot = await this.readOwner(entry.target, refresh, withDeadline, deadlineAt, onFallback);
    return entry.unknownReason
      ? { ...snapshot, unknownReason: entry.unknownReason }
      : snapshot;
  }

  /**
   * One owner's read, under its provider-specific deadline
   * when `withDeadline` is set (otherwise under the reader's own limits). A
   * read that times out or fails still lists the owner, from ledger evidence
   * alone.
   */
  private async readOwner(
    target: PlanOwnerTarget,
    refresh: boolean,
    withDeadline: boolean,
    deadlineAt?: number,
    onFallback?: () => void,
  ): Promise<PlanLimitOwnerSnapshot> {
    const controller = withDeadline ? new AbortController() : undefined;
    const remainingMs = controller
      ? Math.min(limitLookupDeadlineMs(target.providerId), (deadlineAt ?? this.now()) - this.now())
      : 0;
    if (controller && remainingMs <= 0) {
      this.logger.debug('[PlanLimitsSnapshot] owner read ended without a snapshot', {
        providerId: target.providerId,
        reason: 'timeout',
      });
      onFallback?.();
      return this.unreadSnapshot(target.ownerRef);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const read = this.usage.getOwnerSnapshot(target, {
        refresh,
        ...(controller && { signal: controller.signal }),
      });
      if (!controller) return await read;
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('Plan limit owner read deadline'));
        }, remainingMs);
        timer.unref?.();
      });
      return await Promise.race([read, timeout]);
    } catch (error: unknown) {
      this.logger.debug(
        '[PlanLimitsSnapshot] owner read ended without a snapshot',
        {
          providerId: target.providerId,
          reason: controller?.signal.aborted
            ? 'timeout'
            : error instanceof Error
              ? error.name
              : typeof error,
        },
      );
      onFallback?.();
      return this.unreadSnapshot(target.ownerRef);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  /** The owner as `service-unavailable`, with whatever the ledger holds. */
  private unreadSnapshot(owner: QuotaOwnerRef): PlanLimitOwnerSnapshot {
    const evidence = this.ledger.snapshotFor(owner.key);
    return {
      owner,
      status: 'service-unavailable',
      windowSetEstablished: false,
      windows: evidence?.windows ?? [],
      ownerEvidence: evidence?.ownerEvidence ?? [],
      ...(evidence?.cooldown && { cooldown: evidence.cooldown }),
    };
  }

  /** Ledger owners plus native Codex and provider-session sessions bound to a discovered owner. */
  private async sessionOwners(
    sessionIds: readonly string[],
    owners: readonly PlanLimitOwnerSnapshot[],
  ): Promise<Record<string, PlanLimitSessionOwner>> {
    const known = this.ledger.sessionOwners();
    const result: Record<string, PlanLimitSessionOwner> = { ...known };
    const codexOwners = new Set(owners.filter((entry) =>
      entry.owner.providerId === 'openai-codex',
    ).map((entry) => entry.owner.key));
    for (const sessionId of sessionIds) {
      if (!result[sessionId]?.ownerKey && this.metadata && this.ownerResolver) {
        try {
          const metadata = await this.metadata.get(sessionId);
          const execution = metadata?.codexExecution;
          if (execution?.runtime === 'codex-app-server') {
            const owner = this.ownerResolver.ownerForCodexHome(execution.codex.normalizedHome);
            if (codexOwners.has(owner.key)) {
              result[sessionId] = { ownerKey: owner.key, modelScope: null };
            }
          }
          const providerSession = metadata?.providerSessionExecution;
          if (providerSession?.runtime === 'provider-session') {
            const ownerKey = providerSessionOwnerKey(
              providerSession.providerSession.profile,
              owners,
            );
            if (ownerKey) result[sessionId] = { ownerKey, modelScope: null };
          }
        } catch (error: unknown) {
          this.logger.warn('[PlanLimitsSnapshot] native session owner lookup failed', {
            errorName: error instanceof Error ? error.name : typeof error,
          });
        }
      }
      result[sessionId] ??= { ownerKey: null, modelScope: null };
    }
    return result;
  }
}

/**
 * The listed owner a provider-session session bills: its CLI's own signed-in
 * account, which discovery lists from the CLI store or the selected provider
 * (issue #1459). Absent when no owner of that provider is listed, so the view
 * never borrows another provider's account.
 */
function providerSessionOwnerKey(
  profile: ProviderSessionProfileId,
  owners: readonly PlanLimitOwnerSnapshot[],
): string | undefined {
  const providerIds: readonly string[] =
    profile === 'opencode' ? ['opencode-go', 'opencode'] : [profile];
  for (const providerId of providerIds) {
    const owner = owners.find(
      (entry) =>
        entry.owner.providerId === providerId &&
        entry.owner.identityKind !== 'unknown',
    );
    if (owner) return owner.owner.key;
  }
  return undefined;
}

function discoveryRequest(
  request: PlanLimitsSnapshotRequest,
): PlanOwnerDiscoveryRequest {
  return {
    ...(request.providerId !== undefined && {
      selectedProviderId: request.providerId,
    }),
    ...(request.sessionIds !== undefined && {
      sessionIds: [...request.sessionIds],
    }),
    ...(request.ownerKeys !== undefined && {
      ownerKeys: [...request.ownerKeys],
    }),
  };
}

/** The dedupe key of one scope; its hash is the logged `scopeId`. */
function scopeKey(scope: PlanOwnerDiscoveryRequest, refresh: boolean): string {
  return JSON.stringify({
    providerId: scope.selectedProviderId,
    sessionIds: [...new Set(scope.sessionIds ?? [])].sort(),
    ownerKeys: [...new Set(scope.ownerKeys ?? [])].sort(),
    refresh,
  });
}
