import type { CliDetectionResult, EffortSupport } from '@ptah-extension/shared';
import { z } from 'zod';
import type { LaneModelEntry } from '../lane-model-listing.port';
import { CATALOG_REFRESH_AGE_MS, CATALOG_RETRY_AFTER_MS } from '../routing-constants';

const CatalogStatusSchema = z.enum(['ok', 'timeout', 'error', 'empty', 'never']);

export type CatalogStatus = z.infer<typeof CatalogStatusSchema>;

export interface LaneCatalogModel extends Omit<LaneModelEntry, 'efforts'> {
  readonly efforts: EffortSupport;
}

export interface LaneCatalogEntry {
  readonly laneId: string;
  /** Models from the last successful read. */
  readonly models: readonly LaneCatalogModel[];
  /** Status of the latest read attempt. */
  readonly status: CatalogStatus;
  readonly fetchedAt: number | null;
  readonly lastOkAt: number | null;
}

export interface LaneCatalogSnapshotReader {
  get(laneId: string): LaneCatalogEntry | undefined;
  entries(): readonly LaneCatalogEntry[];
}

export interface LaneCatalogRefresher {
  refresh(row: CliDetectionResult, nowMs: number): Promise<LaneCatalogEntry>;
  refreshIfDue(row: CliDetectionResult, nowMs: number): void;
}

export function isCatalogRefreshDue(entry: LaneCatalogEntry | undefined, nowMs: number): boolean {
  const delay = entry?.status === 'ok' ? CATALOG_REFRESH_AGE_MS : CATALOG_RETRY_AFTER_MS;
  return entry?.fetchedAt == null || nowMs - entry.fetchedAt >= delay;
}

const EffortSupportSchema = z.discriminatedUnion('provenance', [
  z.object({
    provenance: z.literal('native'),
    supported: z.array(z.string()),
    default: z.string().nullable(),
  }),
  z.object({
    provenance: z.literal('ptah-fallback'),
    supported: z.array(z.string()),
    default: z.null(),
  }),
  z.object({ provenance: z.literal('unknown') }),
]);

const LaneCatalogModelSchema = z.object({
  id: z.string().refine((id) => id.trim().length > 0),
  provenance: z.enum(['reported', 'fallback', 'configured', 'tier']),
  auto: z.boolean().optional(),
  efforts: EffortSupportSchema,
});

export const LaneCatalogDocumentSchema = z.object({
  version: z.literal(1),
  entries: z.array(z.object({
    laneId: z.string().min(1),
    models: z.array(LaneCatalogModelSchema),
    status: CatalogStatusSchema,
    fetchedAt: z.number().finite().nullable(),
    lastOkAt: z.number().finite().nullable(),
  })),
});
