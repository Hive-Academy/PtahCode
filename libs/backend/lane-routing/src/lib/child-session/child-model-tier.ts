import { getAnthropicProvider } from '@ptah-extension/shared';

export type ChildModelTier = 0 | 1 | 2 | 3;

export function childModelTier(model: string): ChildModelTier | undefined {
  const tokens = model.toLowerCase().split(/[-_./:\d]+/).filter(Boolean);
  if (tokens.includes('default')) return undefined;
  if (tokens.includes('fable')) return 3;
  if (tokens.some((token) => ['opus', 'pro', 'large', 'strong'].includes(token))) return 2;
  if (tokens.some((token) => ['haiku', 'mini', 'nano', 'flash', 'small', 'lite'].includes(token))) return 0;
  return 1;
}

/** Version numbers of an id; date suffixes (`-20251001`, `-2024-08-06`, `-preview-05-06`) are not versions. */
function version(model: string): number[] {
  const undated = model
    .replace(/[-_]\d{8}(?=$|[-_])/g, '')
    .replace(/-\d{4}-\d{2}-\d{2}(?=$|[-_])/g, '')
    .replace(/(-(?:preview|exp))-\d{2}-\d{2}(?=$|[-_])/g, '$1');
  return (undated.match(/\d+/g) ?? []).map(Number);
}

export function compareChildModelVersions(a: string, b: string): number {
  const av = version(a); const bv = version(b);
  for (let index = 0; index < Math.max(av.length, bv.length); index++) {
    const difference = (bv[index] ?? 0) - (av[index] ?? 0);
    if (difference) return difference;
  }
  return a.localeCompare(b);
}

/**
 * Known context window of an id. Only native Claude ids (the `claude-cli` static list) and the
 * 200k families below are known; other provider ids return undefined, so for them the 1M
 * preference cannot apply and version order alone decides.
 */
export function childModelWindow(model: string): number | undefined {
  const known = getAnthropicProvider('claude-cli')?.staticModels?.find((entry) => entry.id === model)?.contextLength;
  if (known) return known;
  if (/^claude-(?:haiku-4-5|3)/i.test(model)) return 200_000;
  return undefined;
}

/**
 * Tiers to try, in order, for a target tier. Code work (1) goes up to strong when no balanced
 * model exists; deep work (2) falls back to balanced, never to small; Fable (3) is pin-only.
 */
const TIER_ORDER: Readonly<Record<ChildModelTier, readonly ChildModelTier[]>> = {
  0: [0, 1, 2],
  1: [1, 2],
  2: [2, 1],
  3: [],
};

/**
 * Return the candidates of every tier in {@link TIER_ORDER}, in that order. Admission can refuse
 * a whole tier, so the next allowed tier must stay in the list.
 */
export function childModelCandidates(models: readonly string[], floor: ChildModelTier): string[] {
  const unique = [...new Set(models)];
  return TIER_ORDER[floor].flatMap((tier) => {
    const candidates = unique.filter((model) => childModelTier(model) === tier);
    const hasMillion = candidates.some((model) => (childModelWindow(model) ?? 0) >= 1_000_000);
    const eligible = hasMillion ? candidates.filter((model) => childModelWindow(model) !== 200_000) : candidates;
    return eligible.sort(compareChildModelVersions);
  });
}
