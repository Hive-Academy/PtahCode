/**
 * `ptah_cron_*` — MCP tools for the cron scheduler (issue #1400 Part 1).
 *
 * Nine tools over `ptah.cron` (`cron-namespace.builder.ts`). The zod schema
 * of each tool is the contract its handler validates with, and the published
 * `inputSchema` is generated from it, so the two cannot drift.
 *
 * The five write tools change what runs unattended later. The permission
 * handler (agent-sdk `CRON_MUTATING_TOOL_NAMES`) asks the user before each of
 * them in every permission level and denies them in unattended sessions.
 * `CRON_MUTATING_TOOL_NAMES` here must list the same five names; the spec
 * compares the two lists.
 */
import { z } from 'zod';
import type { MCPToolDefinition, PtahAPI } from '../types';
import type { LifecycleTool } from './lifecycle-tools';

export const CRON_LIST_TOOL_NAME = 'ptah_cron_list';
export const CRON_GET_TOOL_NAME = 'ptah_cron_get';
export const CRON_CREATE_TOOL_NAME = 'ptah_cron_create';
export const CRON_UPDATE_TOOL_NAME = 'ptah_cron_update';
export const CRON_TOGGLE_TOOL_NAME = 'ptah_cron_toggle';
export const CRON_DELETE_TOOL_NAME = 'ptah_cron_delete';
export const CRON_RUN_NOW_TOOL_NAME = 'ptah_cron_run_now';
export const CRON_RUNS_TOOL_NAME = 'ptah_cron_runs';
export const CRON_NEXT_FIRE_TOOL_NAME = 'ptah_cron_next_fire';

/** Tools that only read scheduler state. */
export const CRON_READ_TOOL_NAMES = [
  CRON_LIST_TOOL_NAME,
  CRON_GET_TOOL_NAME,
  CRON_RUNS_TOOL_NAME,
  CRON_NEXT_FIRE_TOOL_NAME,
] as const;

/** Tools that change scheduler state. Each call needs user approval. */
export const CRON_MUTATING_TOOL_NAMES = [
  CRON_CREATE_TOOL_NAME,
  CRON_UPDATE_TOOL_NAME,
  CRON_TOGGLE_TOOL_NAME,
  CRON_DELETE_TOOL_NAME,
  CRON_RUN_NOW_TOOL_NAME,
] as const;

export const CRON_TOOL_NAMES = [
  ...CRON_READ_TOOL_NAMES,
  ...CRON_MUTATING_TOOL_NAMES,
] as const;

export type CronToolName = (typeof CRON_TOOL_NAMES)[number];

/** Same limit as cron-scheduler `CRON_JOB_PROMPT_MAX`, which also enforces it. */
const CRON_PROMPT_MAX = 20_000;

const jobId = z.string().min(1).describe('The id of a scheduled job.');
const cronExpression = z
  .string()
  .min(1)
  .describe(
    'Cron expression with 5 fields (minute hour day-of-month month day-of-week), e.g. "0 9 * * 1-5".',
  );
const timezone = z
  .string()
  .min(1)
  .describe('IANA timezone, e.g. "Europe/Berlin". Default: UTC.');
const workspaceRoot = z
  .string()
  .min(1)
  .describe('Absolute path of the workspace the job runs in.');

export const CronListArgsSchema = z
  .object({
    workspaceRoot: workspaceRoot
      .describe('Only jobs of this workspace (absolute path). Default: all.')
      .optional(),
    enabledOnly: z.boolean().optional(),
  })
  .strict();

export const CronGetArgsSchema = z.object({ id: jobId }).strict();

export const CronCreateArgsSchema = z
  .object({
    name: z.string().min(1).max(200),
    cronExpression,
    prompt: z
      .string()
      .min(1)
      .max(CRON_PROMPT_MAX)
      .describe(
        'What the agent does on each run. Write it as a complete task: the run starts with no memory of this conversation.',
      ),
    workspaceRoot: workspaceRoot
      .describe(
        'Absolute path of the workspace the job runs in. Default: the workspace of this session.',
      )
      .optional(),
    timezone: timezone.optional(),
    enabled: z.boolean().describe('Default: true.').optional(),
  })
  .strict();

export const CronUpdateArgsSchema = z
  .object({
    id: jobId,
    name: z.string().min(1).max(200).optional(),
    cronExpression: cronExpression.optional(),
    prompt: z.string().min(1).max(CRON_PROMPT_MAX).optional(),
    workspaceRoot: workspaceRoot
      .nullable()
      .describe('Absolute path, or null to remove the workspace.')
      .optional(),
    timezone: timezone.optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

export const CronToggleArgsSchema = z
  .object({ id: jobId, enabled: z.boolean() })
  .strict();

export const CronDeleteArgsSchema = z.object({ id: jobId }).strict();

export const CronRunNowArgsSchema = z.object({ id: jobId }).strict();

export const CronRunsArgsSchema = z
  .object({
    id: jobId,
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .describe('Newest runs first. Default: 20.')
      .optional(),
  })
  .strict();

export const CronNextFireArgsSchema = z
  .object({
    id: jobId.describe('A saved job. Use this OR cronExpression.').optional(),
    cronExpression: cronExpression
      .describe('An expression to preview before you save it.')
      .optional(),
    timezone: timezone.optional(),
    count: z
      .number()
      .int()
      .min(1)
      .max(50)
      .describe('How many fire times to return for cronExpression. Default: 1.')
      .optional(),
  })
  .strict();

type InputSchema = MCPToolDefinition['inputSchema'];

/** The zod contract as an MCP `inputSchema` fragment (no `$schema` keyword). */
function inputSchemaOf(schema: z.ZodType): InputSchema {
  const generated: Record<string, unknown> = z.toJSONSchema(schema, {
    io: 'input',
    target: 'draft-7',
  });
  const { $schema: _ignoredSchemaKeyword, ...fragment } = generated;
  return { ...fragment, type: 'object' } as InputSchema;
}

const APPROVAL_NOTE =
  'The user approves each call: explain the job to them first. Not available in unattended sessions.';

const definitions: Record<CronToolName, MCPToolDefinition> = {
  [CRON_LIST_TOOL_NAME]: {
    name: CRON_LIST_TOOL_NAME,
    description:
      'List scheduled jobs (the Schedules page): id, name, cron expression, timezone, enabled, ' +
      'workspace, next fire time, the status of the last run and who created the job. ' +
      'The prompt is a preview; ptah_cron_get returns it in full.',
    inputSchema: inputSchemaOf(CronListArgsSchema),
    annotations: { readOnlyHint: true },
  },
  [CRON_GET_TOOL_NAME]: {
    name: CRON_GET_TOOL_NAME,
    description:
      'Read one scheduled job with its full prompt, next fire time and last run status.',
    inputSchema: inputSchemaOf(CronGetArgsSchema),
    annotations: { readOnlyHint: true },
  },
  [CRON_CREATE_TOOL_NAME]: {
    name: CRON_CREATE_TOOL_NAME,
    description:
      'Create a scheduled job: Ptah runs the prompt as a new agent session on the cron schedule, ' +
      'with nobody watching. Use it when the user asks for recurring or timed work ("every ' +
      'morning", "each Monday", "at 18:00"). Check the schedule with ptah_cron_next_fire first. ' +
      'Returns the job id and the next fire time. ' +
      APPROVAL_NOTE,
    inputSchema: inputSchemaOf(CronCreateArgsSchema),
    annotations: { readOnlyHint: false },
  },
  [CRON_UPDATE_TOOL_NAME]: {
    name: CRON_UPDATE_TOOL_NAME,
    description:
      'Change a scheduled job: name, cron expression, prompt, workspace, timezone or enabled. ' +
      'Only the fields you send change. ' +
      APPROVAL_NOTE,
    inputSchema: inputSchemaOf(CronUpdateArgsSchema),
    annotations: { readOnlyHint: false },
  },
  [CRON_TOGGLE_TOOL_NAME]: {
    name: CRON_TOGGLE_TOOL_NAME,
    description:
      'Enable or disable a scheduled job. A disabled job keeps its history and does not run. ' +
      APPROVAL_NOTE,
    inputSchema: inputSchemaOf(CronToggleArgsSchema),
    annotations: { readOnlyHint: false },
  },
  [CRON_DELETE_TOOL_NAME]: {
    name: CRON_DELETE_TOOL_NAME,
    description:
      'Delete a scheduled job and its future runs. To stop a job for a time, use ptah_cron_toggle. ' +
      APPROVAL_NOTE,
    inputSchema: inputSchemaOf(CronDeleteArgsSchema),
    annotations: { readOnlyHint: false },
  },
  [CRON_RUN_NOW_TOOL_NAME]: {
    name: CRON_RUN_NOW_TOOL_NAME,
    description:
      'Run a scheduled job now, outside its schedule. Returns the run; read its result later ' +
      'with ptah_cron_runs. ' +
      APPROVAL_NOTE,
    inputSchema: inputSchemaOf(CronRunNowArgsSchema),
    annotations: { readOnlyHint: false },
  },
  [CRON_RUNS_TOOL_NAME]: {
    name: CRON_RUNS_TOOL_NAME,
    description:
      'Run history of a scheduled job, newest first: status, scheduled / start / end time, ' +
      'result summary, error message and the session id of the run.',
    inputSchema: inputSchemaOf(CronRunsArgsSchema),
    annotations: { readOnlyHint: true },
  },
  [CRON_NEXT_FIRE_TOOL_NAME]: {
    name: CRON_NEXT_FIRE_TOOL_NAME,
    description:
      'When a schedule fires next. Give the id of a saved job, or a cronExpression (with ' +
      'timezone and count) to check an expression before you save it. A bad expression is ' +
      'refused with the reason.',
    inputSchema: inputSchemaOf(CronNextFireArgsSchema),
    annotations: { readOnlyHint: true },
  },
};

function refused(reason: string): string {
  return JSON.stringify({ status: 'refused', reason });
}

/** First zod issue as one line: `cronExpression: Too small ...`. */
function describeIssues(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'Invalid arguments.';
  const path = issue.path.join('.');
  return path ? `${path}: ${issue.message}` : issue.message;
}

/** Validate with `schema`, then call the namespace and serialize its result. */
function handlerFor<T>(
  schema: z.ZodType<T>,
  call: (args: T, api: PtahAPI) => Promise<unknown>,
): LifecycleTool['handler'] {
  return async (input, api) => {
    const parsed = schema.safeParse(input ?? {});
    if (!parsed.success) {
      return refused(`Invalid arguments. ${describeIssues(parsed.error)}`);
    }
    return JSON.stringify(await call(parsed.data, api));
  };
}

export const cronTools: readonly LifecycleTool[] = [
  {
    definition: definitions[CRON_LIST_TOOL_NAME],
    handler: handlerFor(CronListArgsSchema, (args, api) => api.cron.list(args)),
  },
  {
    definition: definitions[CRON_GET_TOOL_NAME],
    handler: handlerFor(CronGetArgsSchema, (args, api) => api.cron.get(args)),
  },
  {
    definition: definitions[CRON_CREATE_TOOL_NAME],
    handler: handlerFor(CronCreateArgsSchema, (args, api) =>
      api.cron.create(args),
    ),
  },
  {
    definition: definitions[CRON_UPDATE_TOOL_NAME],
    handler: handlerFor(CronUpdateArgsSchema, (args, api) =>
      api.cron.update(args),
    ),
  },
  {
    definition: definitions[CRON_TOGGLE_TOOL_NAME],
    handler: handlerFor(CronToggleArgsSchema, (args, api) =>
      api.cron.toggle(args),
    ),
  },
  {
    definition: definitions[CRON_DELETE_TOOL_NAME],
    handler: handlerFor(CronDeleteArgsSchema, (args, api) =>
      api.cron.delete(args),
    ),
  },
  {
    definition: definitions[CRON_RUN_NOW_TOOL_NAME],
    handler: handlerFor(CronRunNowArgsSchema, (args, api) =>
      api.cron.runNow(args),
    ),
  },
  {
    definition: definitions[CRON_RUNS_TOOL_NAME],
    handler: handlerFor(CronRunsArgsSchema, (args, api) => api.cron.runs(args)),
  },
  {
    definition: definitions[CRON_NEXT_FIRE_TOOL_NAME],
    handler: handlerFor(CronNextFireArgsSchema, (args, api) =>
      api.cron.nextFire(args),
    ),
  },
];
