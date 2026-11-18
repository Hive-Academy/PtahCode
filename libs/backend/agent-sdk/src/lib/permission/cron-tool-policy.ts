/**
 * Cron tool permission policy (TASK_2026_2272_7f01, issue #1400 Part 1).
 *
 * A scheduled job runs an agent prompt later, with nobody watching. A model
 * must therefore never create or change a job without a human approving that
 * exact change. The five Ptah MCP tools below change scheduler state:
 *
 * - They always prompt the user, in every permission level (default,
 *   auto-edit, yolo), and a stored "Always Allow" rule never skips the prompt.
 * - "Always Allow" on their prompt allows the one call and stores no rule.
 * - Unattended sessions (nobody can answer a prompt) deny them.
 *
 * The read tools (`ptah_cron_list`, `_get`, `_runs`, `_next_fire`) keep the
 * normal MCP tool handling.
 *
 * agent-sdk sits below cron-scheduler in the library graph, so the prompt
 * text comes from the tool input only. For id-only tools (toggle, delete,
 * run_now) it shows the job id, not the job's stored prompt.
 *
 * Pure functions; no DI, no state.
 */

const PTAH_MCP_PREFIX = 'mcp__ptah__';

/** Bare MCP tool names of the cron tools that change scheduler state. */
export const CRON_MUTATING_TOOL_BASE_NAMES = [
  'ptah_cron_create',
  'ptah_cron_update',
  'ptah_cron_toggle',
  'ptah_cron_delete',
  'ptah_cron_run_now',
] as const;

export type CronMutatingToolBaseName =
  (typeof CRON_MUTATING_TOOL_BASE_NAMES)[number];

/** Full SDK tool names (`mcp__ptah__<name>`) of the cron write tools. */
export const CRON_MUTATING_TOOL_NAMES = CRON_MUTATING_TOOL_BASE_NAMES.map(
  (name) => `${PTAH_MCP_PREFIX}${name}` as const,
);

const CRON_MUTATING_TOOL_NAME_SET: ReadonlySet<string> = new Set(
  CRON_MUTATING_TOOL_NAMES,
);

/** True when `toolName` is one of the five cron write tools (SDK name). */
export function isCronMutatingTool(toolName: string): boolean {
  return CRON_MUTATING_TOOL_NAME_SET.has(toolName);
}

/** Deny message for an unattended session that calls a cron write tool. */
export const CRON_UNATTENDED_DENY_MESSAGE =
  'Scheduled jobs can only be created or changed with user approval in an ' +
  'interactive session. Nobody can approve this call here, so it was not run. ' +
  'Tell the parent session which job you want and why instead.';

/** Longest single-line field (name, schedule, timezone, path, id) shown. */
const FIELD_MAX = 300;

function readString(
  source: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return undefined;
}

function readBoolean(
  source: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = source[key];
  return typeof value === 'boolean' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * One-line form of a model-supplied value. Control characters and line breaks
 * become spaces, so a value cannot forge another line of the approval text
 * (for example a fake "Workspace:" line inside a job name).
 */
function oneLine(value: string): string {
  const flat = value
    // eslint-disable-next-line no-control-regex -- strips them on purpose
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ')
    .trim();
  return flat.length > FIELD_MAX ? `${flat.slice(0, FIELD_MAX)}…` : flat;
}

/**
 * Job fields of a create/update input. Accepts the fields flat or inside a
 * `patch` object, and both `cronExpression` and `cronExpr` for the schedule.
 */
function describeJobFields(
  input: Record<string, unknown>,
  mode: 'create' | 'update',
): string[] {
  const fields = isRecord(input['patch'])
    ? { ...input, ...input['patch'] }
    : input;
  const lines: string[] = [];
  const name = readString(fields, 'name');
  if (name) lines.push(`Name: ${oneLine(name)}`);
  const schedule = readString(fields, 'cronExpression', 'cronExpr');
  if (schedule) {
    const timezone = readString(fields, 'timezone');
    lines.push(
      `Schedule: ${oneLine(schedule)}${timezone ? ` (${oneLine(timezone)})` : ''}`,
    );
  } else {
    const timezone = readString(fields, 'timezone');
    if (timezone) lines.push(`Timezone: ${oneLine(timezone)}`);
  }
  const workspace = readString(fields, 'workspaceRoot');
  if (workspace) {
    lines.push(`Workspace: ${oneLine(workspace)}`);
  } else if (fields['workspaceRoot'] === null) {
    lines.push('Workspace: none (the job runs without a workspace)');
  } else if (mode === 'create') {
    // An update without `workspaceRoot` keeps the job's current workspace.
    lines.push('Workspace: the workspace of this session (default)');
  }
  const enabled = readBoolean(fields, 'enabled');
  if (enabled !== undefined) lines.push(`Enabled: ${enabled ? 'yes' : 'no'}`);
  const prompt = readString(fields, 'prompt');
  // The whole prompt, never a preview: the user approves exactly the text
  // that will run unattended. It is the last block, so nothing follows it.
  // The tool schema and `CronJobService` cap its length.
  if (prompt) lines.push(`Prompt (everything below this line):\n${prompt}`);
  return lines;
}

/**
 * Human-readable permission prompt text for a cron write tool, or `undefined`
 * when `toolName` is not one of them.
 */
export function describeCronToolRequest(
  toolName: string,
  input: Record<string, unknown>,
): string | undefined {
  if (!isCronMutatingTool(toolName)) return undefined;
  const baseName = toolName.slice(PTAH_MCP_PREFIX.length);
  const jobId = readString(input, 'id', 'jobId');
  const jobRef = jobId ? `scheduled job ${oneLine(jobId)}` : 'a scheduled job';

  switch (baseName as CronMutatingToolBaseName) {
    case 'ptah_cron_create':
      return [
        'Create a scheduled job. It will run this prompt unattended on the schedule below.',
        ...describeJobFields(input, 'create'),
      ].join('\n');
    case 'ptah_cron_update':
      return [`Change ${jobRef}.`, ...describeJobFields(input, 'update')].join(
        '\n',
      );
    case 'ptah_cron_toggle': {
      const enabled = readBoolean(input, 'enabled');
      if (enabled === undefined) return `Enable or disable ${jobRef}.`;
      return enabled
        ? `Enable ${jobRef}. It will run unattended on its schedule.`
        : `Disable ${jobRef}.`;
    }
    case 'ptah_cron_delete':
      return `Delete ${jobRef} and stop its future runs.`;
    case 'ptah_cron_run_now':
      return `Run ${jobRef} now. Its prompt runs unattended in its workspace.`;
    default:
      return undefined;
  }
}
