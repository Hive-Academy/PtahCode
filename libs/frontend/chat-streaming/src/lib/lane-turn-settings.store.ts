/**
 * Lane Turn Settings Store
 *
 * Lane-scoped composer state: the options a lane offers (models, efforts,
 * slash commands) and the model or effort the user picked for its next turn.
 * Keyed by agent id and held in renderer memory only.
 *
 * This store never reads or writes tab state. A pick in a lane composer must
 * not change the main chat's per-tab model or effort overrides, so the store
 * has no dependency on `TabManagerService`.
 *
 * A pending pick is cleared once a message carrying it is accepted, or once
 * the agent record confirms it: the model when the record's `model` or
 * `observedModel` equals the pick, the effort when its `reasoningEffort`
 * equals the pick. Entries of agents the monitor no longer tracks are dropped.
 */

import { Injectable, effect, inject, signal } from '@angular/core';
import type {
  AgentGetLaneComposerOptionsResult,
  LaneTurnInputCapabilities,
  LaneTurnSettings,
} from '@ptah-extension/shared';
import { AgentId } from '@ptah-extension/shared';
import { ClaudeRpcService, LoggingService } from '@ptah-extension/core';
import { AgentDeliveryStore } from './agent-delivery.store';
import { AgentMonitorStore } from './agent-monitor.store';

/** Shown while the first catalog load or the first preview is outstanding. */
export const LANE_OPTIONS_CHECKING_TEXT = 'Checking lane options…';
/** Shown beside Retry when the catalog could not be loaded. */
export const LANE_OPTIONS_ERROR_TEXT = 'Could not load lane options.';
/** Shown when the lane answered its preview without a per-turn input section. */
export const LANE_OPTIONS_UNREPORTED_TEXT = 'Lane did not report its options.';
/** Shown beside Retry when the lists shown are the last known ones and the latest read failed. */
export const LANE_OPTIONS_STALE_TEXT = 'Showing the last known lane options. The latest read failed.';

/** Renderer budget for one catalog read; the host bounds its own lookup. */
const LANE_OPTIONS_TIMEOUT_MS = 15_000;

export type LaneCatalogStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface LaneComposerCatalog {
  readonly status: LaneCatalogStatus;
  /** Options from the last successful read; kept while a refresh runs. */
  readonly options?: AgentGetLaneComposerOptionsResult;
  /** True while a refresh of a `ready` catalog runs (the pickers stay enabled). */
  readonly refreshing: boolean;
  /**
   * Backend or transport reason of the last failed read. On a `ready` catalog
   * the lists shown are the last known ones (a partial answer or a failed refresh).
   */
  readonly errorDetail?: string;
}

/**
 * What the composer knows about a lane's per-turn input (A-TL1): `checking`
 * until the first preview returns, `reported` once a section is present, and
 * `unreported` when a preview came back without one.
 */
export type LaneTurnInputState =
  | { readonly kind: 'checking' }
  | { readonly kind: 'reported'; readonly turnInput: LaneTurnInputCapabilities }
  | { readonly kind: 'unreported'; readonly reason: string };

/** The record fields that confirm a pick; `MonitoredAgent` carries a subset. */
interface LaneTurnRecord {
  readonly model?: string;
  readonly reasoningEffort?: string;
  readonly observedModel?: string;
}

const IDLE_CATALOG: LaneComposerCatalog = { status: 'idle', refreshing: false };
const EMPTY_PENDING: LaneTurnSettings = {};

/** The pick minus the fields the record already confirms; the same object when nothing is confirmed. */
function unconfirmed(pick: LaneTurnSettings, record: LaneTurnRecord): LaneTurnSettings {
  const modelConfirmed =
    pick.model !== undefined && (record.model === pick.model || record.observedModel === pick.model);
  const effortConfirmed =
    pick.reasoningEffort !== undefined && record.reasoningEffort === pick.reasoningEffort;
  if (!modelConfirmed && !effortConfirmed) return pick;
  return {
    ...(modelConfirmed ? {} : pick.model !== undefined ? { model: pick.model } : {}),
    ...(effortConfirmed ? {} : pick.reasoningEffort !== undefined ? { reasoningEffort: pick.reasoningEffort } : {}),
  };
}

function isEmpty(settings: LaneTurnSettings): boolean {
  return settings.model === undefined && settings.reasoningEffort === undefined;
}

function withEntry<T>(map: ReadonlyMap<string, T>, key: string, value: T | undefined): ReadonlyMap<string, T> {
  const next = new Map(map);
  if (value === undefined) next.delete(key);
  else next.set(key, value);
  return next;
}

@Injectable({ providedIn: 'root' })
export class LaneTurnSettingsStore {
  private readonly rpc = inject(ClaudeRpcService);
  private readonly logger = inject(LoggingService);
  private readonly monitor = inject(AgentMonitorStore);
  private readonly delivery = inject(AgentDeliveryStore);

  private readonly _catalogs = signal<ReadonlyMap<string, LaneComposerCatalog>>(new Map());
  private readonly _pending = signal<ReadonlyMap<string, LaneTurnSettings>>(new Map());
  /** One read in flight per lane; a pruned lane's late answer is dropped. */
  private readonly inFlight = new Map<string, Promise<void>>();

  readonly catalogs = this._catalogs.asReadonly();
  readonly pendingByAgent = this._pending.asReadonly();

  constructor() {
    effect(() => this.reconcile(this.monitor.agentsById()));
  }

  catalog(agentId: string): LaneComposerCatalog {
    return this._catalogs().get(agentId) ?? IDLE_CATALOG;
  }

  /** The user's model or effort pick for the lane's next turn; empty when none waits. */
  pending(agentId: string): LaneTurnSettings {
    return this._pending().get(agentId) ?? EMPTY_PENDING;
  }

  /** Settings to send with the next turn, or `undefined` to keep the lane's current ones. */
  turnSettings(agentId: string): LaneTurnSettings | undefined {
    const pick = this._pending().get(agentId);
    return pick && !isEmpty(pick) ? pick : undefined;
  }

  /** Pick a model for the lane's next turn; `null` keeps the lane's current model. */
  pickModel(agentId: string, model: string | null): void {
    this.pick(agentId, 'model', model?.trim() || undefined);
  }

  /** Pick a reasoning effort for the lane's next turn; `null` keeps the lane's current effort. */
  pickEffort(agentId: string, effort: string | null): void {
    this.pick(agentId, 'reasoningEffort', effort?.trim() || undefined);
  }

  /** Drop the lane's pick; the composer calls it once a message carrying the pick is accepted. */
  clearPending(agentId: string): void {
    if (!this._pending().has(agentId)) return;
    this._pending.update((current) => withEntry(current, agentId, undefined));
  }

  /**
   * Per-turn input support from the latest preview, else from the agent record.
   * Absent everywhere: `checking` until a preview returns, then `unreported`.
   */
  turnInput(agentId: string): LaneTurnInputState {
    const { queue, now } = this.delivery.composerState(agentId);
    const fromPreview = queue?.effectiveCapabilities?.turnInput ?? now?.effectiveCapabilities?.turnInput;
    const reported = fromPreview ?? this.monitor.agentsById().get(agentId)?.effectiveCapabilities?.turnInput;
    if (reported) return { kind: 'reported', turnInput: reported };
    if (queue || now) return { kind: 'unreported', reason: LANE_OPTIONS_UNREPORTED_TEXT };
    return { kind: 'checking' };
  }

  /** True while gated controls must stay `aria-disabled`: first catalog load or no preview yet. */
  isChecking(agentId: string): boolean {
    return this.catalog(agentId).status === 'loading' || this.turnInput(agentId).kind === 'checking';
  }

  /**
   * Read the lane's composer options. Called on dropdown open and by Retry.
   * A first read (or one after an error) moves through `loading`; a refresh of
   * a `ready` catalog keeps it `ready` and keeps the old options if it fails.
   */
  loadCatalog(agentId: string): Promise<void> {
    const running = this.inFlight.get(agentId);
    if (running) return running;
    const before = this.catalog(agentId);
    const refresh = before.status === 'ready';
    this.setCatalog(agentId, refresh ? { ...before, refreshing: true } : { status: 'loading', refreshing: false });
    const read = this.read(agentId).then((outcome) => {
      if (this.inFlight.get(agentId) !== read) return;
      this.inFlight.delete(agentId);
      if (outcome.ok) {
        // A partial answer keeps its lists and shows its error beside them (M5).
        this.setCatalog(agentId, {
          status: 'ready', options: outcome.options, refreshing: false,
          ...(outcome.options.error ? { errorDetail: outcome.options.error } : {}),
        });
        return;
      }
      this.logger.warn('LaneTurnSettingsStore', 'Lane composer options failed', outcome.detail);
      const current = this.catalog(agentId);
      this.setCatalog(agentId, refresh && current.options
        ? { status: 'ready', options: current.options, refreshing: false, errorDetail: outcome.detail }
        : { status: 'error', refreshing: false, errorDetail: outcome.detail });
    });
    this.inFlight.set(agentId, read);
    return read;
  }

  private async read(
    agentId: string,
  ): Promise<{ ok: true; options: AgentGetLaneComposerOptionsResult } | { ok: false; detail: string }> {
    try {
      const result = await this.rpc.call(
        'agent:getLaneComposerOptions',
        { agentId: AgentId.from(agentId) },
        { timeout: LANE_OPTIONS_TIMEOUT_MS },
      );
      if (!result.isSuccess()) return { ok: false, detail: result.error ?? 'Lane options request failed' };
      const { models, efforts, commands, error } = result.data;
      // The host sends what it still has beside `error`: usable lists are kept.
      if (error && models.length === 0 && efforts.length === 0 && commands.length === 0) {
        return { ok: false, detail: error };
      }
      return { ok: true, options: result.data };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }

  private pick(agentId: string, field: keyof LaneTurnSettings, value: string | undefined): void {
    this._pending.update((current) => {
      const prior = current.get(agentId) ?? EMPTY_PENDING;
      const merged: LaneTurnSettings = { ...prior, [field]: value };
      const record = this.monitor.agentsById().get(agentId);
      const next = record ? unconfirmed(merged, record) : merged;
      const cleaned: LaneTurnSettings = {
        ...(next.model !== undefined ? { model: next.model } : {}),
        ...(next.reasoningEffort !== undefined ? { reasoningEffort: next.reasoningEffort } : {}),
      };
      if (isEmpty(cleaned)) return current.has(agentId) ? withEntry(current, agentId, undefined) : current;
      return withEntry(current, agentId, cleaned);
    });
  }

  private setCatalog(agentId: string, catalog: LaneComposerCatalog): void {
    this._catalogs.update((current) => withEntry(current, agentId, catalog));
  }

  /** Drop confirmed picks and every entry of a lane the monitor no longer tracks. */
  private reconcile(records: ReadonlyMap<string, LaneTurnRecord>): void {
    const pending = this._pending();
    let nextPending: Map<string, LaneTurnSettings> | null = null;
    for (const [agentId, pick] of pending) {
      const record = records.get(agentId);
      const kept = record ? unconfirmed(pick, record) : EMPTY_PENDING;
      if (kept === pick) continue;
      nextPending ??= new Map(pending);
      if (isEmpty(kept)) nextPending.delete(agentId);
      else nextPending.set(agentId, kept);
    }
    if (nextPending) this._pending.set(nextPending);

    const catalogs = this._catalogs();
    const gone = [...catalogs.keys()].filter((agentId) => !records.has(agentId));
    if (gone.length === 0) return;
    const nextCatalogs = new Map(catalogs);
    for (const agentId of gone) {
      nextCatalogs.delete(agentId);
      this.inFlight.delete(agentId);
    }
    this._catalogs.set(nextCatalogs);
  }
}
