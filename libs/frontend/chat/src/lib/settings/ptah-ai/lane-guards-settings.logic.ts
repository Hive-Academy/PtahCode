/**
 * Lane repeat-call guard value (`agentOrchestration.laneRepeatCallStopAt`).
 * Lanes have no tool-call budget. The host asks a lane to hand off when it repeats
 * one identical call this many times, and pauses its new tool calls at twice that
 * count. The lane stays alive. The storage key keeps its historic name. Bounds match `isLaneRepeatCallStopAt`
 * in agent-rpc.handlers.ts: a safe integer >= 2.
 */

export const LANE_GUARD_KEYS = ['laneRepeatCallStopAt'] as const;

export type LaneGuardKey = (typeof LANE_GUARD_KEYS)[number];

export interface LaneGuardField {
  readonly key: LaneGuardKey;
  readonly label: string;
  readonly min: number;
  readonly info: string;
  readonly testId: string;
}

export const LANE_GUARD_FIELDS: readonly LaneGuardField[] = [
  {
    key: 'laneRepeatCallStopAt',
    label: 'Repeat-call handoff at',
    min: 2,
    testId: 'lane-guards-repeat',
    info: 'This guard asks a lane to hand off when it repeats the same call this many times. If the lane keeps repeating the call up to twice this count, Ptah pauses its new tool calls. A paused lane stays alive: review its progress and decide how it continues. Lanes also have a weighted token budget and a duration limit. A lane gets a handoff request when it reaches the budget warning ratio, and Ptah pauses its new work at twice the limit. Ptah never stops a lane for its budget.',
  },
];

/** Defaults from `FILE_BASED_SETTINGS_DEFAULTS` / `LANE_REPEAT_CALL_STOP_AT_DEFAULT`. */
export const LANE_GUARD_DEFAULTS: Readonly<Record<LaneGuardKey, number>> = {
  laneRepeatCallStopAt: 20,
};

export type LaneGuardValues = Record<LaneGuardKey, number>;

export type LaneGuardParse =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly error: string };

export function parseLaneGuardInteger(
  raw: string,
  min: number,
): LaneGuardParse {
  const text = raw.trim().replace(/[,_\s]/g, '');
  if (text === '') return { ok: false, error: 'Enter a value.' };
  if (!/^\d+$/.test(text)) return { ok: false, error: 'Enter a whole number.' };
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < min) {
    return { ok: false, error: `Enter a whole number from ${min}.` };
  }
  return { ok: true, value };
}

export function laneGuardFieldError(
  key: LaneGuardKey,
  drafts: Readonly<Record<LaneGuardKey, string>>,
): string | null {
  const field = LANE_GUARD_FIELDS.find((item) => item.key === key);
  if (!field) return 'Enter a value.';
  const parsed = parseLaneGuardInteger(drafts[key], field.min);
  return parsed.ok ? null : parsed.error;
}

/** Values to send for one commit, or null when the draft is invalid or unchanged. */
export function laneGuardWrite(
  key: LaneGuardKey,
  drafts: Readonly<Record<LaneGuardKey, string>>,
  saved: LaneGuardValues,
): Partial<LaneGuardValues> | null {
  const field = LANE_GUARD_FIELDS.find((item) => item.key === key);
  if (!field) return null;
  const parsed = parseLaneGuardInteger(drafts[key], field.min);
  if (!parsed.ok || parsed.value === saved[key]) return null;
  return { [key]: parsed.value };
}

/** Read a host config value, or the default when it is missing or out of range. */
export function laneGuardFromConfig(key: LaneGuardKey, value: unknown): number {
  const min = LANE_GUARD_FIELDS.find((field) => field.key === key)?.min ?? 1;
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= min
    ? value
    : LANE_GUARD_DEFAULTS[key];
}

/** Which field a host rejection names, when the message includes the key. */
export function laneGuardKeyInError(error: string): LaneGuardKey | null {
  for (const key of LANE_GUARD_KEYS) {
    if (error.includes(key)) return key;
  }
  return null;
}
