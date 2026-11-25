import type { IStateStorage } from '@ptah-extension/platform-core';
import type { CliDetectionResult, EffortSupport } from '@ptah-extension/shared';
import type { LaneModelEntry, LaneModelListing } from '../lane-model-listing.port';
import type { LaneRoutingLogger } from '../lane-routing-logger';
import { laneCandidateId } from '../ranking/candidate.types';
import {
  CATALOG_REFRESH_AGE_MS,
  CATALOG_REFRESH_TIMEOUT_MS,
  CATALOG_RETRY_AFTER_MS,
  CATALOG_STORAGE_KEY,
} from '../routing-constants';
import {
  LaneCatalogDocumentSchema,
  type CatalogStatus,
  type LaneCatalogEntry,
  type LaneCatalogModel,
  type LaneCatalogRefresher,
  type LaneCatalogSnapshotReader,
} from './lane-catalog.types';

export class LaneCatalogStore implements LaneCatalogSnapshotReader, LaneCatalogRefresher {
  private readonly snapshot = new Map<string, LaneCatalogEntry>();
  private readonly inFlight = new Map<string, Promise<LaneCatalogEntry>>();
  private writeChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly storage: IStateStorage,
    private readonly listing: LaneModelListing,
    private readonly logger: LaneRoutingLogger,
  ) {
    this.load();
  }

  get(laneId: string): LaneCatalogEntry | undefined {
    return this.snapshot.get(laneId);
  }

  entries(): readonly LaneCatalogEntry[] {
    return [...this.snapshot.values()];
  }

  refreshIfDue(row: CliDetectionResult, nowMs: number): void {
    const entry = this.get(laneCandidateId(row));
    const delay = entry?.status === 'ok' ? CATALOG_REFRESH_AGE_MS : CATALOG_RETRY_AFTER_MS;
    if (entry?.fetchedAt == null || nowMs - entry.fetchedAt >= delay) {
      void this.refresh(row, nowMs);
    }
  }

  refresh(row: CliDetectionResult, nowMs: number): Promise<LaneCatalogEntry> {
    const laneId = laneCandidateId(row);
    const pending = this.inFlight.get(laneId);
    if (pending) return pending;

    const refresh = Promise.resolve()
      .then(() => this.fetch(row, laneId, nowMs))
      .finally(() => this.inFlight.delete(laneId));
    this.inFlight.set(laneId, refresh);
    return refresh;
  }

  private load(): void {
    let raw: unknown;
    try {
      raw = this.storage.get<unknown>(CATALOG_STORAGE_KEY);
    } catch (error: unknown) {
      this.logger.warn('[lane-routing] catalog snapshot read failed', {
        status: 'error',
        errorClass: errorClass(error),
      });
      return;
    }
    if (raw === undefined) return;

    const parsed = LaneCatalogDocumentSchema.safeParse(raw);
    if (!parsed.success) {
      this.logger.warn('[lane-routing] catalog snapshot is invalid', { status: 'error' });
      return;
    }
    for (const entry of parsed.data.entries) {
      this.snapshot.set(entry.laneId, entry);
    }
  }

  private async fetch(
    row: CliDetectionResult,
    laneId: string,
    nowMs: number,
  ): Promise<LaneCatalogEntry> {
    const signal = AbortSignal.timeout(CATALOG_REFRESH_TIMEOUT_MS);
    let status: CatalogStatus;
    let models: readonly LaneCatalogModel[] = [];
    let rejectOnAbort: (() => void) | undefined;
    try {
      // Some listing implementations do not observe abort. Release the flight
      // at the signal deadline even if the underlying listing keeps running.
      const aborted = new Promise<never>((_resolve, reject) => {
        rejectOnAbort = () => reject(signal.reason);
        signal.addEventListener('abort', rejectOnAbort, { once: true });
        if (signal.aborted) rejectOnAbort();
      });
      const listed = await Promise.race([
        aborted,
        Promise.resolve().then(() => this.listing.list(row, signal)),
      ]);
      signal.throwIfAborted();
      models = listed.filter((model) => model.id.trim().length > 0).map((model) => ({
        ...model,
        efforts: copyEfforts(model.efforts),
      }));
      status = models.length > 0 ? 'ok' : 'empty';
      if (status === 'empty') {
        this.logger.warn('[lane-routing] catalog refresh yielded no models', { laneId, status });
      }
    } catch (error: unknown) {
      status = signal.aborted ? 'timeout' : 'error';
      this.logger.warn('[lane-routing] catalog refresh failed', {
        laneId,
        status,
        errorClass: errorClass(error),
      });
    } finally {
      if (rejectOnAbort) signal.removeEventListener('abort', rejectOnAbort);
    }

    const previous = this.get(laneId);
    const entry: LaneCatalogEntry = {
      laneId,
      models: status === 'ok' ? models : previous?.models ?? [],
      status,
      fetchedAt: nowMs,
      lastOkAt: status === 'ok' ? nowMs : previous?.lastOkAt ?? null,
    };
    this.snapshot.set(laneId, entry);
    // Serialize writes so a slower write cannot replace a newer snapshot.
    this.writeChain = this.writeChain.then(async () => {
      try {
        await this.storage.update(CATALOG_STORAGE_KEY, { version: 1, entries: this.entries() });
      } catch (error: unknown) {
        this.logger.warn('[lane-routing] catalog snapshot write failed', {
          laneId,
          status: 'error',
          errorClass: errorClass(error),
        });
      }
    });
    await this.writeChain;
    return entry;
  }
}

function copyEfforts(efforts: LaneModelEntry['efforts']): EffortSupport {
  if (!efforts || efforts.provenance === 'unknown') return { provenance: 'unknown' };
  return { ...efforts, supported: efforts.supported.filter((value) => typeof value === 'string') };
}

function errorClass(error: unknown): string {
  if (error instanceof DOMException) return 'DOMException';
  return error instanceof Error ? error.constructor.name : 'UnknownError';
}
