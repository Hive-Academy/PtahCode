import type { ChildSettingSource, EffortLevel } from '@ptah-extension/shared';

export interface ChildSettingChoice {
  readonly model?: string;
  readonly effort?: EffortLevel;
  readonly modelSource: ChildSettingSource;
  readonly effortSource: ChildSettingSource;
}

function strength(model: string): number {
  const tokens = model
    .toLowerCase()
    .split(/[-_./:\d]+/)
    .filter(Boolean);
  if (
    tokens.some((token) => ['opus', 'pro', 'large', 'strong'].includes(token))
  )
    return 2;
  if (
    tokens.some((token) =>
      ['haiku', 'mini', 'nano', 'flash', 'small', 'lite'].includes(token),
    )
  )
    return 0;
  return 1;
}

export function rankChildSettings(
  brief: string,
  models: readonly string[],
): ChildSettingChoice {
  const ordered = [...new Set(models)].sort(
    (a, b) => strength(a) - strength(b) || a.localeCompare(b),
  );
  const strong = /unknown (?:cause|reason)|security|architectur/i.test(brief);
  const small =
    !strong && /coordinat|\bgit\b|\bci\b|continuous integration/i.test(brief);
  if (!strong && !small)
    return { modelSource: 'default', effortSource: 'default' };
  const model = strong ? ordered.at(-1) : ordered[0];
  return {
    ...(model ? { model } : {}),
    effort: strong ? 'high' : 'low',
    modelSource: model ? 'ranking' : 'default',
    effortSource: 'ranking',
  };
}
