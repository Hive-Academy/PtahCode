/**
 * Parsers for the plan usage `agy -p /usage --output-format json` reports
 * (agy 1.5.14 probe, TASK_2026_2302 decision-agy-cli-usage.md).
 *
 * - `command.data.groups[].buckets[]`: one group per quota pool ("Gemini
 *   Models", "Claude and GPT models"), each bucket one window
 *   (`window: "5h" | "weekly"`) with `remaining_fraction` and `reset_time`.
 * - `response`: the same data as tab-separated lines
 *   `<group>\t<label>\t<remaining %>\t<ISO-8601 UTC reset>`; read only when
 *   `command` is absent.
 *
 * A reset at or before the Unix epoch (agy prints 1970-01-01T00:00:00Z for a
 * pool with no use) means no reset is known. Unknown text is never read as
 * 0 % used.
 */
import { z } from 'zod';
import type { PlanLimitWindow, PlanWindowKind } from '@ptah-extension/shared';
import { antigravityGroupSlug, antigravityWindowIdentity } from './antigravity-usage-window';

const DAY_MS = 24 * 60 * 60_000;
const MAX_TSV_LINES = 64;
const MAX_FIELD_LENGTH = 96;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const PERCENT = /^(\d{1,3}(?:\.\d+)?)%$/;

const BucketSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  window: z.string().min(1),
  remaining_fraction: z.number().finite().min(0).max(1),
  reset_time: z.string().optional(),
}).passthrough();
const GroupSchema = z.object({
  name: z.string().min(1),
  buckets: z.array(z.unknown()),
}).passthrough();
const DataSchema = z.object({ groups: z.array(z.unknown()) }).passthrough();
const TsvRowSchema = z.tuple([
  z.string().min(1).max(MAX_FIELD_LENGTH),
  z.string().min(1).max(MAX_FIELD_LENGTH).regex(/(?:five\s*hour|5h|weekly)/i),
  z.string().regex(PERCENT)
    .transform((value) => Number(PERCENT.exec(value)?.[1]))
    .pipe(z.number().min(0).max(100)),
  z.string().regex(ISO_UTC),
]);

interface WindowDescriptor { kind: PlanWindowKind; label: string; durationMins?: number }

function classify(value: string): WindowDescriptor | undefined {
  if (/five[\s_-]*hours?|\b5h\b/i.test(value))
    return { kind: 'five_hour', label: '5 Hour', durationMins: 300 };
  if (/week/i.test(value)) return { kind: 'weekly', label: 'Weekly', durationMins: 10_080 };
  return antigravityGroupSlug(value) ? { kind: 'other', label: value } : undefined;
}

/** A reset instant, or undefined when agy reports none (epoch) or a stale one. */
function knownReset(value: string | undefined, observedAt: number): number | undefined {
  const resetsAt = Date.parse(value ?? '');
  return Number.isFinite(resetsAt) && resetsAt > 0 && resetsAt >= observedAt - DAY_MS
    ? resetsAt : undefined;
}

function usedPercent(remainingFraction: number): number {
  return remainingFraction === 0 ? 100
    : Math.min(Math.round((1 - remainingFraction) * 1000) / 10, 99.9);
}

function toWindow(
  identity: { key: `other:${string}`; label: string },
  group: string,
  descriptor: WindowDescriptor,
  remainingFraction: number,
  resetsAt: number | undefined,
  observedAt: number,
): PlanLimitWindow {
  return {
    key: identity.key,
    kind: descriptor.kind,
    label: identity.label,
    group,
    ...(descriptor.durationMins && { durationMins: descriptor.durationMins }),
    used: { kind: 'percent', percent: usedPercent(remainingFraction) },
    usedSource: 'provider-unofficial',
    usedObservedAt: observedAt,
    ...(resetsAt !== undefined && { resetsAt, resetSource: 'provider-unofficial' as const }),
    observedAt,
  };
}

function slugCollisions(names: readonly string[]): (name: string) => boolean {
  const counts = new Map<string, number>();
  for (const name of names) {
    const slug = antigravityGroupSlug(name);
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  return (name) => (counts.get(antigravityGroupSlug(name)) ?? 0) > 1;
}

/**
 * Windows from `command.data` of a `/usage` command. Undefined when no group
 * holds a readable bucket; an unreadable bucket is skipped, never zeroed.
 */
export function parseAntigravityUsageGroups(
  data: unknown,
  observedAt: number,
): PlanLimitWindow[] | undefined {
  const parsed = DataSchema.safeParse(data);
  if (!parsed.success) return undefined;
  const groups = parsed.data.groups.flatMap((raw) => {
    const group = GroupSchema.safeParse(raw);
    if (!group.success) return [];
    const buckets = group.data.buckets.flatMap((rawBucket) => {
      const bucket = BucketSchema.safeParse(rawBucket);
      const descriptor = bucket.success ? classify(bucket.data.window) : undefined;
      return bucket.success && descriptor ? [{ bucket: bucket.data, descriptor }] : [];
    });
    return buckets.length ? [{ name: group.data.name, buckets }] : [];
  });
  const collides = slugCollisions(groups.map((group) => group.name));
  const windows: PlanLimitWindow[] = [];
  const keys = new Set<string>();
  for (const [index, group] of groups.entries()) {
    for (const { bucket, descriptor } of group.buckets) {
      const identity = antigravityWindowIdentity(group.name, index, descriptor.kind,
        bucket.name ?? descriptor.label, collides(group.name));
      if (keys.has(identity.key)) continue;
      keys.add(identity.key);
      windows.push(toWindow(identity, group.name, descriptor, bucket.remaining_fraction,
        knownReset(bucket.reset_time, observedAt), observedAt));
    }
  }
  return windows.length ? windows : undefined;
}

/**
 * Windows from the tab-separated `response` text. Fails closed: one
 * malformed or duplicate line rejects the whole text.
 */
export function parseAntigravityUsageTsv(
  text: string,
  observedAt: number,
): PlanLimitWindow[] | undefined {
  const rows = text.split(/\r?\n/).filter((line) => line.trim() !== '')
    .map((line) => TsvRowSchema.safeParse(line.split('\t').map((field) => field.trim())));
  if (rows.length === 0 || rows.length > MAX_TSV_LINES) return undefined;
  const parsedRows: z.infer<typeof TsvRowSchema>[] = [];
  for (const row of rows) {
    if (!row.success) return undefined;
    parsedRows.push(row.data);
  }
  const groupNames = [...new Set(parsedRows.map(([group]) => group))];
  const collides = slugCollisions(groupNames);
  const windows: PlanLimitWindow[] = [];
  const keys = new Set<string>();
  for (const [group, label, remainingPercent, reset] of parsedRows) {
    const descriptor = classify(label);
    if (!descriptor) return undefined;
    const identity = antigravityWindowIdentity(group, groupNames.indexOf(group),
      descriptor.kind, label, collides(group));
    if (keys.has(identity.key)) return undefined;
    keys.add(identity.key);
    windows.push(toWindow(identity, group, descriptor, remainingPercent / 100,
      knownReset(reset, observedAt), observedAt));
  }
  return windows;
}
