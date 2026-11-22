/** `response` text of `agy -p /usage`: `<group>\t<label>\t<remaining %>\t<reset>`. */
export const ANTIGRAVITY_USAGE_FIXTURE = [
  'Gemini Models\tWeekly Limit Remaining\t80%\t2030-01-08T00:00:00Z',
  'Gemini Models\tFive Hour Limit Remaining\t70%\t2030-01-01T05:00:00Z',
  'Claude and GPT models\tWeekly Limit Remaining\t60%\t2030-01-08T00:00:00Z',
  'Claude and GPT models\tFive Hour Limit Remaining\t50%\t2030-01-01T05:00:00Z',
].join('\n');

/**
 * `agy -p /usage --output-format json` in the shape the agy 1.5.14 probe
 * returned (decision-agy-cli-usage.md): no turn, zero counters, an empty
 * conversation id and the quota groups under `command.data`. A pool with no
 * use reports the epoch as its reset.
 */
export function antigravityUsageJsonFixture(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    conversation_id: '',
    response: ANTIGRAVITY_USAGE_FIXTURE,
    num_turns: 0,
    usage: { input_tokens: 0, output_tokens: 0, thinking_tokens: 0, cache_read_tokens: 0, total_tokens: 0 },
    command: { name: 'usage', data: { groups: [
      { name: 'Gemini Models', buckets: [
        { id: 'gemini-5h', name: 'Five Hour Limit', window: '5h', remaining_fraction: 0.7,
          reset_time: '2030-01-01T05:00:00Z' },
        { id: 'gemini-weekly', name: 'Weekly Limit', window: 'weekly', remaining_fraction: 0.8,
          reset_time: '2030-01-08T00:00:00Z' },
      ] },
      { name: 'Claude and GPT models', buckets: [
        { id: 'third-party-5h', name: 'Five Hour Limit', window: '5h', remaining_fraction: 1,
          reset_time: '1970-01-01T00:00:00Z' },
        { id: 'third-party-weekly', name: 'Weekly Limit', window: 'weekly', remaining_fraction: 0.25,
          reset_time: '2030-01-08T00:00:00Z' },
      ] },
    ] } },
    ...overrides,
  };
}
