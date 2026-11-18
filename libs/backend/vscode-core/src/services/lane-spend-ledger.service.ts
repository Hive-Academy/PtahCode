/** Durable, owner-attributed API usage tables through the existing state port.
 * Writes are serialized and published only after persistence succeeds.
 * Owner reset revisions are advisory invalidation counters, not compare-and-swap
 * guards. Event revisions separately deduplicate producer updates; callers must
 * serialize reset decisions if they need stale-command rejection.
 * Plan exhaustion continues to belong to auth-providers' plan-limit ledger.
 */
import type { IStateStorage, LaneSpendReader, SessionUsageContribution, SessionUsageSink } from '@ptah-extension/platform-core';
import type { ApiLaneSpend, LaneSpendPeriod } from '@ptah-extension/shared';
import type { Logger } from '../logging/logger';
import { SpendEventSchema, SpendLedgerSchema, type SpendLedger } from './lane-spend-ledger.schema';

export const LANE_SPEND_STORAGE_KEY = 'ptah.laneSpend.v1';
export const LANE_SPEND_CORRUPT_BACKUP_KEY = 'ptah.laneSpend.corruptBackup.v1';
const DAY = 86_400_000;
function rowCost(row: SpendLedger['events'][number]): number | null {
  return !row.runCostSnapshot && row.totalCostAuthority !== 'unpriced' ? row.totalCostMicroUsd : null;
}
export class LaneSpendLedgerService implements LaneSpendReader, SessionUsageSink {
  private state: SpendLedger = { version: 1, events: [], owners: [], credits: [] };
  private available = true;
  private pending: Promise<void> = Promise.resolve();
  constructor(private readonly storage: IStateStorage, private readonly logger: Pick<Logger, 'warn'>) {
    try {
      const raw = storage.get<unknown>(LANE_SPEND_STORAGE_KEY);
      if (raw !== undefined) this.state = SpendLedgerSchema.parse(raw);
    } catch (error: unknown) {
      this.available = false;
      this.logger.warn('Lane spend storage unavailable', { kind: error instanceof Error ? error.name : 'unknown' });
    }
  }
  private enqueue(change: (next: SpendLedger) => void, repair = false): Promise<void> {
    const write = this.pending.then(async () => {
      if (!this.available && !repair) throw new Error('Lane spend storage unavailable');
      const repairing = !this.available;
      // An owner clear re-reads storage first, so a transient read failure keeps
      // other owners' data. Only a ledger that still fails validation is replaced;
      // its raw payload is backed up below before the repair write.
      const next = repairing ? this.readForRepair() : SpendLedgerSchema.parse(this.state);
      change(next);
      try {
        if (repairing) {
          // Preserve the raw payload before an explicit reset repairs storage.
          await this.storage.update(LANE_SPEND_CORRUPT_BACKUP_KEY, this.storage.get<unknown>(LANE_SPEND_STORAGE_KEY));
        }
        await this.storage.update(LANE_SPEND_STORAGE_KEY, SpendLedgerSchema.parse(next));
        this.state = next;
        this.available = true;
      } catch (error: unknown) {
        // The accepted state is still valid; retry persistence on the next write.
        this.logger.warn('Lane spend persistence failed', { kind: error instanceof Error ? error.name : 'unknown' });
        throw error;
      }
    });
    // degradation-audit: reported - the caller receives the same rejection
    // through `return write`; this branch only keeps the write queue drainable.
    this.pending = write.catch(() => undefined);
    return write;
  }
  private readForRepair(): SpendLedger {
    const raw = this.storage.get<unknown>(LANE_SPEND_STORAGE_KEY);
    const parsed = raw === undefined ? undefined : SpendLedgerSchema.safeParse(raw);
    return parsed?.success ? parsed.data : { version: 1, events: [], owners: [], credits: [] };
  }
  recordUsage(event: SessionUsageContribution): Promise<void> {
    if (event.billingMode !== 'api-key') return Promise.resolve();
    if (!event.ownerKey) {
      // No payload/identity fields: producer metadata can contain sensitive data.
      this.logger.warn('Lane spend API-key event ignored: missing owner attribution');
      return Promise.resolve();
    }
    if (event.billable === false || event.source === 'estimated') return Promise.resolve();
    let accepted: SpendLedger['events'][number];
    try {
      accepted = SpendEventSchema.parse(event);
    } catch (error: unknown) {
      return Promise.reject(error);
    }
    return this.enqueue((next) => {
      const owner = next.owners.find((entry) => entry.ownerKey === accepted.ownerKey);
      if (owner && accepted.occurredAtMs <= owner.resetAtMs) {
        if (!owner.resetRunIds.includes(accepted.runId)) owner.resetRunIds.push(accepted.runId);
        return;
      }
      const index = next.events.findIndex((old) => old.ownerKey === accepted.ownerKey && old.runId === accepted.runId && old.eventKey === accepted.eventKey);
      if (index >= 0 && next.events[index].revision >= accepted.revision) return;
      if (index >= 0) next.events[index] = accepted;
      else next.events.push(accepted);
    });
  }
  async recordCreditEvidence(ownerKey: string, occurredAtMs: number, kind: 'credit-exhausted' | 'rate-limited'): Promise<void> {
    const evidence = SpendLedgerSchema.shape.credits.element.parse({ ownerKey, occurredAtMs, kind });
    return this.enqueue((next) => { next.credits.push(evidence); });
  }
  async clear(ownerKey: string, nowMs = Date.now()): Promise<void> {
    const owner = SpendLedgerSchema.shape.owners.element.parse({ ownerKey, resetAtMs: nowMs, revision: 0, resetRunIds: [] });
    return this.enqueue((next) => {
      const old = next.owners.find((entry) => entry.ownerKey === ownerKey);
      owner.revision = (old?.revision ?? 0) + 1;
      next.owners = next.owners.filter((entry) => entry.ownerKey !== ownerKey);
      next.owners.push(owner);
      owner.resetRunIds = [...new Set([...(old?.resetRunIds ?? []), ...next.events.filter((entry) => entry.ownerKey === ownerKey).map((entry) => entry.runId)])];
      next.events = next.events.filter((entry) => entry.ownerKey !== ownerKey);
      next.credits = next.credits.filter((entry) => entry.ownerKey !== ownerKey);
    }, true);
  }
  flush(): Promise<void> { return this.pending; }
  async readSpend(ownerKey: string, nowMs = Date.now()): Promise<ApiLaneSpend> {
    await this.flush();
    const owner = this.state.owners.find((entry) => entry.ownerKey === ownerKey);
    // Budget persistence and enforcement are deferred to batch 2E; null means no local guard.
    const base = { kind: 'api-spend' as const, revision: owner?.revision ?? 0, asOf: nowMs, budget: null };
    if (!this.available) return { ...base, availability: 'unavailable', periods: null, cumulative: null, coverage: 'none', creditEvidence: [] };
    const reset = owner?.resetAtMs ?? 0;
    const events = this.state.events.filter((event) => event.ownerKey === ownerKey && (!owner || event.occurredAtMs > reset) && event.occurredAtMs <= nowMs);
    const period = (startAt: number): { spend: LaneSpendPeriod; coveredRows: Set<SpendLedger['events'][number]> } => {
      const rows = events.filter((event) => event.occurredAtMs >= startAt);
      const coveredRows = new Set<SpendLedger['events'][number]>();
      let knownCostMicroUsd = 0, pricedEvents = 0, unpricedEvents = 0;
      let inputTokens = 0, outputTokens = 0, cacheReadTokens = 0, cacheCreationTokens = 0;
      for (const row of rows) {
        for (const model of row.models) {
          inputTokens += model.inputTokens ?? 0; outputTokens += model.outputTokens ?? 0;
          cacheReadTokens += model.cacheReadTokens ?? 0; cacheCreationTokens += model.cacheCreationTokens ?? 0;
        }
        const cost = rowCost(row);
        if (cost === null) unpricedEvents++; else { pricedEvents++; knownCostMicroUsd += cost; }
      }
      // Absolute run snapshots replace earlier run costs, never add to them.
      // Cross-period snapshots cannot allocate earlier usage to its original period.
      // Retention/compaction is deferred: pruning raw rows would lose cumulative
      // totals and deduplication history until reset without durable rollups.
      for (const runId of new Set(rows.filter((row) => row.runCostSnapshot).map((row) => row.runId))) {
        const run = rows.filter((row) => row.runId === runId);
        const snapshot = run.filter((row) => row.runCostSnapshot).sort((a, b) => b.occurredAtMs - a.occurredAtMs || b.revision - a.revision)[0];
        const crossesBoundary = owner?.resetRunIds.includes(runId) || this.state.events.some((row) =>
          row.ownerKey === ownerKey && row.runId === runId && row.occurredAtMs < startAt);
        if (!crossesBoundary && snapshot.totalCostAuthority !== 'unpriced' && snapshot.totalCostMicroUsd !== null) {
          const covered = run.filter((row) => row.occurredAtMs < snapshot.occurredAtMs ||
            (row.occurredAtMs === snapshot.occurredAtMs && rows.indexOf(row) <= rows.indexOf(snapshot)));
          knownCostMicroUsd -= covered.reduce((sum, row) => sum + (rowCost(row) ?? 0), 0);
          knownCostMicroUsd += snapshot.totalCostMicroUsd;
          const newlyPriced = covered.filter((row) => rowCost(row) === null).length;
          unpricedEvents -= newlyPriced;
          pricedEvents += newlyPriced;
          for (const row of covered) coveredRows.add(row);
        }
      }
      return { spend: { startAt, endAt: nowMs, knownCostMicroUsd, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, pricedEvents, unpricedEvents }, coveredRows };
    };
    const { spend: cumulative, coveredRows } = period(reset);
    const today = Math.floor(nowMs / DAY) * DAY;
    return { ...base, availability: 'available', cumulative,
      periods: { today: period(Math.max(reset, today)).spend, '7d': period(Math.max(reset, nowMs - 7 * DAY)).spend, '30d': period(Math.max(reset, nowMs - 30 * DAY)).spend },
      coverage: cumulative.unpricedEvents || events.some((row) => !coveredRows.has(row) && row.totalCostAuthority === 'model-priced' && row.models.some((model) => (model.cacheCreationTokens ?? 0) > 0 && model.cacheCreation1hTokens == null)) ? (cumulative.pricedEvents ? 'partial' : 'none') : (cumulative.pricedEvents ? 'complete' : 'none'),
      creditEvidence: this.state.credits.filter((entry) => entry.ownerKey === ownerKey && entry.occurredAtMs >= reset && entry.occurredAtMs <= nowMs).map(({ occurredAtMs, kind }) => ({ occurredAtMs, kind })),
    };
  }
}
