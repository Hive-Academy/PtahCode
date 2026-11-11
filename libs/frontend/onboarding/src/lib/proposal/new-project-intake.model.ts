import {
  isNewProjectStack,
  STACK_PROFILES,
  stackLabelForPlatform,
  type NewProjectAudience,
  type NewProjectIntake,
  type NewProjectPlatform,
} from '@ptah-extension/shared';

export const EMPTY_NEW_PROJECT_INTAKE: NewProjectIntake = {
  what: '',
  audience: 'unsure',
  platform: 'node-ts',
  stack: 'recommend',
};

/**
 * The intake vocabulary shared between the Setup Hub launcher form and the
 * visible first user turn in chat.
 */
export const NEW_PROJECT_AUDIENCE_OPTIONS: ReadonlyArray<{
  readonly value: NewProjectAudience;
  readonly label: string;
}> = [
  { value: 'b2b', label: 'B2B' },
  { value: 'b2c', label: 'B2C' },
  { value: 'internal', label: 'Internal tool' },
  { value: 'unsure', label: 'Not sure' },
];

/** The platform chips, in registry order, with an `other` escape hatch. */
export const NEW_PROJECT_PLATFORM_OPTIONS: ReadonlyArray<{
  readonly value: NewProjectPlatform;
  readonly label: string;
}> = [
  ...STACK_PROFILES.map((profile) => ({
    value: profile.id,
    label: profile.label,
  })),
  { value: 'other', label: 'Other' },
];

/** The platform chip's label, for display. */
export function platformLabel(platform: NewProjectPlatform): string {
  return (
    NEW_PROJECT_PLATFORM_OPTIONS.find((option) => option.value === platform)
      ?.label ?? platform
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNewProjectIntakeValid(
  value: unknown,
): value is NewProjectIntake {
  if (!isRecord(value)) return false;
  const audience = value['audience'];
  const stack = value['stack'];
  const platform = value['platform'];
  return (
    typeof value['what'] === 'string' &&
    !!value['what'].trim() &&
    (audience === 'b2b' ||
      audience === 'b2c' ||
      audience === 'internal' ||
      audience === 'unsure') &&
    typeof stack === 'string' &&
    isNewProjectStack(stack) &&
    (platform === undefined ||
      NEW_PROJECT_PLATFORM_OPTIONS.some(
        (option) => option.value === platform,
      )) &&
    (value['constraints'] === undefined ||
      typeof value['constraints'] === 'string') &&
    (stack !== 'other' ||
      (typeof value['stackOther'] === 'string' && !!value['stackOther'].trim()))
  );
}

export const isNewProjectIntake = isNewProjectIntakeValid;

function labelFor(
  options: ReadonlyArray<{ readonly value: string; readonly label: string }>,
  value: string,
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

/**
 * Render the intake as the user's own words for display as the first
 * transcript bubble while the full seed prompt stays in `firstMessagePreamble`.
 */
export function formatIntakeSummary(intake: NewProjectIntake): string {
  const stackLabel =
    intake.stack === 'other' && intake.stackOther?.trim()
      ? intake.stackOther.trim()
      : stackLabelForPlatform(intake.platform, intake.stack);

  const lines = [
    intake.what.trim(),
    '',
    `Who it's for: ${labelFor(NEW_PROJECT_AUDIENCE_OPTIONS, intake.audience)}`,
  ];

  if (intake.platform) {
    lines.push(`Platform: ${platformLabel(intake.platform)}`);
  }

  lines.push(`Stack: ${stackLabel}`);

  const constraints = intake.constraints?.trim();
  if (constraints) {
    lines.push(`Must-haves: ${constraints}`);
  }

  return lines.join('\n');
}
