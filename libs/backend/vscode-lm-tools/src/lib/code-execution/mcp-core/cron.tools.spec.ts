/**
 * `ptah_cron_*` MCP tools: the published definitions, the argument contract of
 * each handler, and the link between the mutating tool list here and the
 * permission list in agent-sdk.
 */
import 'reflect-metadata';
import { CRON_MUTATING_TOOL_NAMES as PERMISSION_CRON_MUTATING_TOOL_NAMES } from '@ptah-extension/agent-sdk';
import { createMockLogger } from '@ptah-extension/shared/testing';
import type { Logger } from '@ptah-extension/vscode-core';
import type { PtahAPI } from '../types';
import {
  CRON_CREATE_TOOL_NAME,
  CRON_DELETE_TOOL_NAME,
  CRON_GET_TOOL_NAME,
  CRON_LIST_TOOL_NAME,
  CRON_MUTATING_TOOL_NAMES,
  CRON_NEXT_FIRE_TOOL_NAME,
  CRON_READ_TOOL_NAMES,
  CRON_RUNS_TOOL_NAME,
  CRON_RUN_NOW_TOOL_NAME,
  CRON_TOGGLE_TOOL_NAME,
  CRON_TOOL_NAMES,
  CRON_UPDATE_TOOL_NAME,
  cronTools,
} from './cron.tools';

type CronMethod =
  | 'list'
  | 'get'
  | 'create'
  | 'update'
  | 'toggle'
  | 'delete'
  | 'runNow'
  | 'runs'
  | 'nextFire';

const CRON_METHODS: readonly CronMethod[] = [
  'list',
  'get',
  'create',
  'update',
  'toggle',
  'delete',
  'runNow',
  'runs',
  'nextFire',
];

const MCP_PREFIX = 'mcp__ptah__';

interface Harness {
  readonly cron: Record<CronMethod, jest.Mock>;
  readonly api: PtahAPI;
  readonly logger: Logger;
}

function createHarness(): Harness {
  const cron: Record<CronMethod, jest.Mock> = {
    list: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    toggle: jest.fn(),
    delete: jest.fn(),
    runNow: jest.fn(),
    runs: jest.fn(),
    nextFire: jest.fn(),
  };
  return {
    cron,
    api: { cron } as unknown as PtahAPI,
    logger: createMockLogger() as unknown as Logger,
  };
}

function toolNamed(name: string): (typeof cronTools)[number] {
  const tool = cronTools.find((entry) => entry.definition.name === name);
  if (!tool) throw new Error(`No cron tool named ${name}`);
  return tool;
}

function inputSchemaOf(name: string): Record<string, unknown> {
  return { ...toolNamed(name).definition.inputSchema };
}

function sorted(names: Iterable<string>): string[] {
  return [...names].sort();
}

function expectNoNamespaceCall(cron: Record<CronMethod, jest.Mock>): void {
  for (const method of CRON_METHODS) {
    expect(cron[method]).not.toHaveBeenCalled();
  }
}

describe('cronTools', () => {
  describe('tool list', () => {
    it('has exactly nine tools, named as CRON_TOOL_NAMES', () => {
      expect(cronTools).toHaveLength(9);
      expect(sorted(cronTools.map((tool) => tool.definition.name))).toEqual(
        sorted(CRON_TOOL_NAMES),
      );
    });

    it('splits the nine names into read and mutating names with no overlap', () => {
      const read: readonly string[] = CRON_READ_TOOL_NAMES;
      const mutating: readonly string[] = CRON_MUTATING_TOOL_NAMES;

      expect(read).toHaveLength(4);
      expect(mutating).toHaveLength(5);
      expect(read.filter((name) => mutating.includes(name))).toEqual([]);
      expect(sorted([...read, ...mutating])).toEqual(sorted(CRON_TOOL_NAMES));
      expect(new Set([...read, ...mutating]).size).toBe(9);
    });

    it('lists the same mutating tools as the agent-sdk permission list', () => {
      expect(
        sorted(CRON_MUTATING_TOOL_NAMES.map((name) => `${MCP_PREFIX}${name}`)),
      ).toEqual(sorted(PERMISSION_CRON_MUTATING_TOOL_NAMES));
    });
  });

  describe('definitions', () => {
    it.each([...CRON_READ_TOOL_NAMES])('%s is read-only', (name) => {
      expect(toolNamed(name).definition.annotations?.readOnlyHint).toBe(true);
    });

    it.each([...CRON_MUTATING_TOOL_NAMES])('%s is not read-only', (name) => {
      expect(toolNamed(name).definition.annotations?.readOnlyHint).toBe(false);
    });

    it.each([...CRON_TOOL_NAMES])(
      '%s publishes a closed object schema without $schema',
      (name) => {
        const schema = inputSchemaOf(name);

        expect(schema['type']).toBe('object');
        expect(schema['additionalProperties']).toBe(false);
        expect(Object.keys(schema)).not.toContain('$schema');
      },
    );

    it('requires name, cronExpression and prompt to create a job', () => {
      expect(inputSchemaOf(CRON_CREATE_TOOL_NAME)['required']).toEqual(
        expect.arrayContaining(['name', 'cronExpression', 'prompt']),
      );
    });
  });

  describe('handlers', () => {
    const validCalls: ReadonlyArray<
      readonly [string, CronMethod, Record<string, unknown>]
    > = [
      [CRON_LIST_TOOL_NAME, 'list', { enabledOnly: true }],
      [CRON_GET_TOOL_NAME, 'get', { id: 'job-1' }],
      [
        CRON_CREATE_TOOL_NAME,
        'create',
        {
          name: 'Morning report',
          cronExpression: '0 9 * * 1-5',
          prompt: 'Summarise the open pull requests.',
        },
      ],
      [CRON_UPDATE_TOOL_NAME, 'update', { id: 'job-1', name: 'Renamed' }],
      [CRON_TOGGLE_TOOL_NAME, 'toggle', { id: 'job-1', enabled: false }],
      [CRON_DELETE_TOOL_NAME, 'delete', { id: 'job-1' }],
      [CRON_RUN_NOW_TOOL_NAME, 'runNow', { id: 'job-1' }],
      [CRON_RUNS_TOOL_NAME, 'runs', { id: 'job-1', limit: 5 }],
      [
        CRON_NEXT_FIRE_TOOL_NAME,
        'nextFire',
        { cronExpression: '0 9 * * *', timezone: 'Europe/Berlin', count: 3 },
      ],
    ];

    it.each(validCalls)(
      '%s calls ptah.cron.%s with the parsed args and returns the result as JSON',
      async (name, method, args) => {
        const { cron, api, logger } = createHarness();
        const result = { status: 'ok', tool: name };
        cron[method].mockResolvedValue(result);

        const output = await toolNamed(name).handler(args, api, logger);

        expect(cron[method]).toHaveBeenCalledTimes(1);
        expect(cron[method]).toHaveBeenCalledWith(args);
        expect(output).toBe(JSON.stringify(result));
        for (const other of CRON_METHODS.filter((key) => key !== method)) {
          expect(cron[other]).not.toHaveBeenCalled();
        }
      },
    );

    it('refuses an unknown extra key and does not call the namespace', async () => {
      const { cron, api, logger } = createHarness();

      const output = await toolNamed(CRON_GET_TOOL_NAME).handler(
        { id: 'job-1', extra: true },
        api,
        logger,
      );

      expect(JSON.parse(output)).toMatchObject({ status: 'refused' });
      expectNoNamespaceCall(cron);
    });

    it('refuses create without a prompt and names the field', async () => {
      const { cron, api, logger } = createHarness();

      const output = await toolNamed(CRON_CREATE_TOOL_NAME).handler(
        { name: 'Morning report', cronExpression: '0 9 * * 1-5' },
        api,
        logger,
      );

      const parsed: { status?: unknown; reason?: unknown } = JSON.parse(output);
      expect(parsed.status).toBe('refused');
      expect(String(parsed.reason)).toContain('prompt');
      expectNoNamespaceCall(cron);
    });

    it.each([0, 101])('refuses ptah_cron_runs with limit %d', async (limit) => {
      const { cron, api, logger } = createHarness();

      const output = await toolNamed(CRON_RUNS_TOOL_NAME).handler(
        { id: 'job-1', limit },
        api,
        logger,
      );

      expect(JSON.parse(output)).toMatchObject({ status: 'refused' });
      expectNoNamespaceCall(cron);
    });

    it('accepts undefined args for ptah_cron_list', async () => {
      const { cron, api, logger } = createHarness();
      cron.list.mockResolvedValue({ jobs: [] });

      const output = await toolNamed(CRON_LIST_TOOL_NAME).handler(
        undefined,
        api,
        logger,
      );

      expect(cron.list).toHaveBeenCalledWith({});
      expect(output).toBe(JSON.stringify({ jobs: [] }));
    });

    it('returns a namespace refusal unchanged', async () => {
      const { cron, api, logger } = createHarness();
      const refusal = {
        status: 'refused',
        reason: 'x',
        field: 'cronExpression',
      };
      cron.create.mockResolvedValue(refusal);

      const output = await toolNamed(CRON_CREATE_TOOL_NAME).handler(
        {
          name: 'Morning report',
          cronExpression: 'not a cron',
          prompt: 'Summarise the open pull requests.',
        },
        api,
        logger,
      );

      expect(output).toBe(JSON.stringify(refusal));
      expect(JSON.parse(output)).toEqual(refusal);
    });
  });
});
