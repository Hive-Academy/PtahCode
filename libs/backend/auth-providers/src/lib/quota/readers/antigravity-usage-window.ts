import type { PlanWindowKind } from '@ptah-extension/shared';

export const antigravityGroupSlug = (value: string) => value.toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function antigravityWindowIdentity(
  group: string, index: number, kind: PlanWindowKind, rawLabel: string, collision = false,
): { key: `other:${string}`; label: string } {
  const groupSlug = antigravityGroupSlug(group);
  const groupKey = !groupSlug ? `group-${index}` : collision ? `${groupSlug}-${index}` : groupSlug;
  const suffix = kind === 'five_hour' ? 'five_hour' : kind === 'weekly' ? 'weekly' : antigravityGroupSlug(rawLabel);
  const label = kind === 'five_hour' ? '5 Hour' : kind === 'weekly' ? 'Weekly' : rawLabel;
  return { key: `other:cli-${groupKey}-${suffix}`, label: `${group} · ${label}` };
}
