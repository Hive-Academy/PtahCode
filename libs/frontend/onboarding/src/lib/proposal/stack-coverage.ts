import type {
  SkillRecommendation,
  StackSummaryItem,
} from '@ptah-extension/shared';

export interface StackCoverageItem {
  name: string;
  kind: StackSummaryItem['kind'];
  evidence: string;
  state: 'covered' | 'available' | 'none' | 'failed';
  selectedCount: number;
  totalCount: number;
}

/** Only exact, case-insensitive comma-separated names constitute coverage. */
export function splitStackEvidence(
  evidence: string,
  detected: readonly StackSummaryItem[],
): { coveredItems: string[]; rawEvidence: string | null } {
  let remaining = evidence.trim().toLowerCase();
  const coveredItems: string[] = [];
  const names = [...detected].sort(
    (a, b) => b.name.trim().length - a.name.trim().length,
  );
  for (const item of names) {
    const name = item.name.trim().toLowerCase();
    if (!name) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`(^|,\\s*)${escaped}(?=\\s*,|$)`);
    if (match.test(remaining)) {
      coveredItems.push(item.name);
      remaining = remaining.replace(match, '$1').trim();
    }
  }
  return {
    coveredItems,
    rawEvidence: coveredItems.length ? null : evidence.trim() || null,
  };
}

export function formatInstallCount(installs: number): string {
  if (installs <= 0) return 'New';
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  })
    .format(installs)
    .toLowerCase();
}

export function buildStackCoverage(
  detected: readonly StackSummaryItem[],
  unmatched: readonly StackSummaryItem[],
  failures: readonly { item: string; reason: string }[],
  recommendations: readonly SkillRecommendation[],
  selectedIds: ReadonlySet<string>,
): StackCoverageItem[] {
  const items = new Map<string, StackSummaryItem>();
  for (const item of [...detected, ...unmatched]) {
    const key = `${item.kind}:${item.name.toLowerCase()}`;
    if (!items.has(key)) items.set(key, item);
  }
  return [...items.values()].map((item) => {
    const matches = new Map(
      recommendations
        .filter((row) =>
          splitStackEvidence(row.evidence, [
            ...items.values(),
          ]).coveredItems.includes(item.name),
        )
        .map((row) => [`${row.skill.source}/${row.skill.skillId}`, row]),
    );
    const selectedCount = [...matches.keys()].filter((key) =>
      selectedIds.has(key),
    ).length;
    const totalCount = matches.size;
    const failed = failures.some(
      (failure) =>
        failure.item.trim().toLowerCase() === item.name.toLowerCase(),
    );
    return {
      name: item.name,
      kind: item.kind,
      evidence: item.evidence,
      selectedCount,
      totalCount,
      state: failed
        ? 'failed'
        : selectedCount
          ? 'covered'
          : totalCount
            ? 'available'
            : 'none',
    };
  });
}
