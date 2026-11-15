import { z } from 'zod';
import type { PlanLimitWindow, PlanWindowKind } from '@ptah-extension/shared';
import { antigravityGroupSlug, antigravityWindowIdentity } from './antigravity-usage-window';

const WindowSchema = z.object({
  kind: z.string().optional(),
  window: z.string().optional(),
  period: z.string().optional(),
  remaining_fraction: z.number().finite().min(0).max(1).optional(),
  remainingFraction: z.number().finite().min(0).max(1).optional(),
  reset_time: z.string().optional(),
  resetTime: z.string().optional(),
}).passthrough();
const GroupSchema = z.object({
  name: z.string().min(1).optional(),
  windows: z.array(z.unknown()).optional(),
}).passthrough();
const OutputSchema = z.object({
  type: z.string().optional(),
  command: z.object({
    name: z.string().optional(),
    data: z.object({ groups: z.array(z.unknown()).optional() }).passthrough().optional(),
  }).passthrough().optional(),
}).passthrough();

function classify(value: string): { kind: PlanWindowKind; label: string; suffix: string; durationMins?: number } {
  if (/^(?:5h|five[\s_-]*hour)$/i.test(value))
    return { kind: 'five_hour', label: '5 Hour', suffix: '5h', durationMins: 300 };
  if (/^week(?:ly)?$/i.test(value))
    return { kind: 'weekly', label: 'Weekly', suffix: 'weekly', durationMins: 10_080 };
  return { kind: 'other', label: value, suffix: slug(value) };
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Undefined means the command was not usable JSON, so the legacy TSV parser may try it. */
export function parseAntigravityUsageJson(output: string, observedAt: number): PlanLimitWindow[] | undefined {
  let body: unknown;
  try { body = JSON.parse(output); } catch { return undefined; }
  const parsed = OutputSchema.safeParse(body);
  const groups = parsed.success && parsed.data.type === 'command' && parsed.data.command?.name === 'usage'
    ? parsed.data.command.data?.groups : undefined;
  if (!groups?.length) return undefined;
  const windows: PlanLimitWindow[] = [];
  const keys = new Set<string>();
  const validGroups: z.infer<typeof GroupSchema>[] = [];
  for (const rawGroup of groups) {
    const parsedGroup = GroupSchema.safeParse(rawGroup);
    if (!parsedGroup.success) continue;
    const group = parsedGroup.data;
    if (!group.name || !group.windows) continue;
    if (!group.windows.some((rawRow) => {
      const row = WindowSchema.safeParse(rawRow);
      return row.success && (row.data.remaining_fraction ?? row.data.remainingFraction) !== undefined &&
        Boolean(row.data.kind ?? row.data.window ?? row.data.period);
    })) continue;
    validGroups.push(group);
  }
  const slugCounts = new Map<string, number>();
  for (const group of validGroups) {
    const slug = antigravityGroupSlug(group.name ?? '');
    slugCounts.set(slug, (slugCounts.get(slug) ?? 0) + 1);
  }
  for (const [index, group] of validGroups.entries()) {
    for (const rawRow of group.windows ?? []) {
      const parsedRow = WindowSchema.safeParse(rawRow);
      if (!parsedRow.success) continue;
      const row = parsedRow.data;
      const remaining = row.remaining_fraction ?? row.remainingFraction;
      const rawKind = row.kind ?? row.window ?? row.period;
      if (remaining === undefined || !rawKind) continue;
      const descriptor = classify(rawKind);
      if (!descriptor.suffix) continue;
      const identity = antigravityWindowIdentity(group.name ?? '', index, descriptor.kind,
        descriptor.label, (slugCounts.get(antigravityGroupSlug(group.name ?? '')) ?? 0) > 1);
      const key = identity.key;
      if (keys.has(key)) continue;
      keys.add(key);
      const resetsAt = Date.parse(row.reset_time ?? row.resetTime ?? '');
      windows.push({
        key, kind: descriptor.kind, label: identity.label,
        ...(descriptor.durationMins && { durationMins: descriptor.durationMins }),
        used: { kind: 'percent', percent: remaining === 0 ? 100 : Math.min(Math.round((1 - remaining) * 1000) / 10, 99.9) },
        usedSource: 'provider-unofficial', usedObservedAt: observedAt,
        ...(Number.isFinite(resetsAt) && resetsAt >= observedAt - 24 * 60 * 60_000 && { resetsAt, resetSource: 'provider-unofficial' as const }),
        observedAt,
      });
    }
  }
  return windows.length ? windows : undefined;
}
