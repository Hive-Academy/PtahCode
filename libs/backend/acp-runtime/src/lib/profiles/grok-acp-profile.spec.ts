/**
 * GrokAcpProfile — argv, MCP entry, session config, extension filter and the
 * error rows. The error rows are checked against the real JSON-RPC errors
 * Grok 1.0.46 sent in the `grok-p3-*` probe transcripts (envelopes
 * `{ms, dir, msg}`), paired with the request each one answered.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type {
  AcpRequestFailure,
  AcpRequestMethod,
  AcpSessionOptions,
} from '../acp-vendor-profile';
import { grokAcpProfile } from './grok-acp-profile';

const FIXTURES = join(__dirname, '..', '__fixtures__');

interface Envelope {
  readonly dir: string;
  readonly msg?: {
    readonly id?: number;
    readonly method?: string;
    readonly params?: Record<string, unknown>;
    readonly result?: Record<string, unknown>;
    readonly error?: { code: number; message: string; data?: unknown };
  };
}

function readEnvelopes(file: string): Envelope[] {
  return readFileSync(join(FIXTURES, file), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Envelope);
}

/** The first error Grok answered `method` with in `file`, and that request's params. */
function fixtureError(
  file: string,
  method: AcpRequestMethod,
): {
  code: number;
  message: string;
  data?: unknown;
  params: Record<string, unknown>;
} {
  const envelopes = readEnvelopes(file);
  const request = envelopes.find(
    (e) => e.dir === 'out' && e.msg?.method === method,
  );
  if (request?.msg?.id === undefined) {
    throw new Error(`${file} has no ${method} request`);
  }
  const reply = envelopes.find(
    (e) => e.dir === 'in' && e.msg?.id === request.msg?.id && e.msg?.error,
  );
  if (!reply?.msg?.error) {
    throw new Error(`${file} has no error answer to ${method}`);
  }
  return { ...reply.msg.error, params: request.msg.params ?? {} };
}

/** The values the fixture session advertised for the `model` config option. */
function advertisedModels(file: string): string[] {
  const created = readEnvelopes(file).find(
    (e) => e.dir === 'in' && e.msg?.result?.['configOptions'],
  );
  const options = created?.msg?.result?.['configOptions'] as Array<{
    id: string;
    options: Array<{ value: string }>;
  }>;
  return (options.find((o) => o.id === 'model')?.options ?? []).map(
    (o) => o.value,
  );
}

const BASE_OPTIONS: AcpSessionOptions = {
  workingDirectory: 'D:\\work\\repo',
  mcp: [],
};

function failure(
  overrides: Partial<AcpRequestFailure> &
    Pick<AcpRequestFailure, 'method' | 'code' | 'message'>,
): AcpRequestFailure {
  return { options: BASE_OPTIONS, ...overrides };
}

describe('grokAcpProfile', () => {
  it('identifies the Grok lane and resumes with session/resume', () => {
    expect(grokAcpProfile.vendor).toBe('grok');
    expect(grokAcpProfile.displayName).toBe('Grok');
    expect(grokAcpProfile.signInHint).toBe('run `grok login`');
    expect(grokAcpProfile.cancelBehavior).toBe('await-reply');
  });

  describe('buildSpawn', () => {
    it('places native yolo approval before stdio and retains it on resume', () => {
      const args = grokAcpProfile.buildSpawn({ ...BASE_OPTIONS, permission: 'yolo', resumeSessionId: 'sess-1' }).args;
      expect(args).toEqual(['agent', '--always-approve', '--no-leader', 'stdio']);
    });
    it('never gives a chat native yolo approval (the chat asks its sink)', () => {
      expect(
        grokAcpProfile.buildSpawn({ ...BASE_OPTIONS, permission: 'yolo', consumer: 'chat' }).args,
      ).not.toContain('--always-approve');
    });
    it('spawns exactly `agent --no-leader stdio` with no extra environment', () => {
      const spec = grokAcpProfile.buildSpawn(BASE_OPTIONS);
      expect(spec.args).toEqual(['agent', '--no-leader', 'stdio']);
      expect(spec.env).toBeUndefined();
    });

    it('never puts the model, effort or approval on argv', () => {
      const { args } = grokAcpProfile.buildSpawn({
        ...BASE_OPTIONS,
        model: 'grok-4.7',
        reasoningEffort: 'high',
        autoApprove: true,
        resumeSessionId: 'sess-1',
        mcp: [],
      });
      expect(args).toEqual(['agent', '--no-leader', 'stdio']);
      expect(args).not.toContain('-m');
      expect(args).not.toContain('--reasoning-effort');
      expect(args).not.toContain('--always-approve');
      expect(args).not.toContain('--leader');
    });
  });

  // The lane builds the URL and bearer (`buildLaneMcpAttachments`; its spec
  // pins the mcpPort and missing-token cases); the profile maps the entry.
  describe('buildMcpServers', () => {
    it('attaches the scoped Ptah http entry the caller built', () => {
      expect(
        grokAcpProfile.buildMcpServers({
          ...BASE_OPTIONS,
          mcp: [
            {
              name: 'ptah',
              url: `http://localhost:51820/agent/agent-7/workspace/${encodeURIComponent('D:\\work\\repo')}`,
              headers: [{ name: 'Authorization', value: 'Bearer lane-token' }],
            },
          ],
        }),
      ).toEqual([
        {
          type: 'http',
          name: 'ptah',
          url: `http://localhost:51820/agent/agent-7/workspace/${encodeURIComponent('D:\\work\\repo')}`,
          headers: [{ name: 'Authorization', value: 'Bearer lane-token' }],
        },
      ]);
    });

    it('maps a user stdio server, name kept', () => {
      expect(
        grokAcpProfile.buildMcpServers({
          ...BASE_OPTIONS,
          mcp: [{ type: 'stdio', name: 'local', command: 'node', args: ['s.js'], env: [] }],
        }),
      ).toEqual([{ name: 'local', command: 'node', args: ['s.js'], env: [] }]);
    });

    it('attaches nothing when the caller built no attachment', () => {
      expect(grokAcpProfile.buildMcpServers(BASE_OPTIONS)).toEqual([]);
      expect(
        grokAcpProfile.buildMcpServers({ ...BASE_OPTIONS, mcp: [] }),
      ).toEqual([]);
    });
  });

  describe('sessionConfig', () => {
    const sessionConfig = grokAcpProfile.sessionConfig;
    if (!sessionConfig) throw new Error('grokAcpProfile.sessionConfig missing');

    it('sets the model and forwards the already-mapped effort as-is', () => {
      expect(
        sessionConfig({
          ...BASE_OPTIONS,
          model: 'grok-4.7',
          reasoningEffort: 'xhigh',
        }),
      ).toEqual([
        { configId: 'model', value: 'grok-4.7', binding: true },
        { configId: 'reasoning_effort', value: 'xhigh' },
      ]);
      expect(
        sessionConfig({ ...BASE_OPTIONS, reasoningEffort: 'low' }),
      ).toEqual([{ configId: 'reasoning_effort', value: 'low' }]);
    });

    it('applies nothing when neither model nor effort is set', () => {
      expect(sessionConfig(BASE_OPTIONS)).toEqual([]);
    });
  });

  it('treats the x.ai namespaces as extension notifications', () => {
    const hook = grokAcpProfile.extensions?.notification;
    if (!hook) throw new Error('extensions.notification missing');
    const isExtension = (method: string): boolean => hook(method, {}, undefined);
    expect(isExtension('_x.ai/session_notification')).toBe(true);
    expect(isExtension('x.ai/auth/status')).toBe(true);
    expect(isExtension('_x.ai/session/prompt_complete')).toBe(true);
    expect(isExtension('session/update')).toBe(false);
    expect(isExtension('_other.vendor/x.ai/thing')).toBe(false);
  });

  it('logs the MCP servers update with its server count and stays silent', () => {
    const hook = grokAcpProfile.extensions?.notification;
    if (!hook) throw new Error('extensions.notification missing');
    const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    expect(hook('_x.ai/mcp/servers_updated', { mcpServers: [{}, {}] }, logger)).toBe(true);
    expect(logger.info).toHaveBeenCalledWith(
      '[AcpSessionHandle] MCP servers updated notification',
      expect.objectContaining({ method: '_x.ai/mcp/servers_updated', serverCount: 2 }),
    );
  });

  it('reads a numeric exit_code from rawOutput only', () => {
    const extract = grokAcpProfile.extractExitCode;
    if (!extract) throw new Error('extractExitCode missing');
    expect(extract({ exit_code: 2 })).toBe(2);
    expect(extract({ exit_code: '2' })).toBeUndefined();
    expect(extract(null)).toBeUndefined();
  });

  describe('extensions.usage (per-call response_completed usage)', () => {
    const usageOf = (method: string, params: Record<string, unknown>) => {
      const hook = grokAcpProfile.extensions?.usage;
      if (!hook) throw new Error('extensions.usage missing');
      return hook(method, params);
    };
    const recordedCalls = (file: string) =>
      readEnvelopes(file)
        .filter((e) => e.dir === 'in' && e.msg?.method === '_x.ai/session_notification')
        .map((e) => usageOf('_x.ai/session_notification', e.msg?.params ?? {}))
        .filter((usage) => usage !== undefined);
    /** The `_meta.usage` turn totals of every answered `session/prompt`. */
    const turnTotals = (file: string) => {
      const envelopes = readEnvelopes(file);
      const promptIds = new Set(
        envelopes
          .filter((e) => e.dir === 'out' && e.msg?.method === 'session/prompt')
          .map((e) => e.msg?.id),
      );
      return envelopes
        .filter((e) => e.dir === 'in' && e.msg?.method === undefined && promptIds.has(e.msg?.id))
        .map((e) => (e.msg?.result?.['_meta'] as { usage?: { inputTokens: number; outputTokens: number } } | undefined)?.usage)
        .filter((usage) => usage !== undefined);
    };
    const sum = (rows: ReadonlyArray<{ inputTokens: number; outputTokens: number }>) =>
      rows.reduce(
        (total, row) => ({
          inputTokens: total.inputTokens + row.inputTokens,
          outputTokens: total.outputTokens + row.outputTokens,
        }),
        { inputTokens: 0, outputTokens: 0 },
      );

    it('maps the three model calls of the p1 fixture to the turn total', () => {
      const calls = recordedCalls('grok-p1-ptah-mcp-search-use-tool.ndjson');
      expect(calls).toEqual([
        { inputTokens: 18267, outputTokens: 168 },
        { inputTokens: 25092, outputTokens: 227 },
        { inputTokens: 25665, outputTokens: 78 },
      ]);
      expect(sum(calls)).toEqual({ inputTokens: 69024, outputTokens: 473 });
    });

    it.each(
      readdirSync(FIXTURES).filter((file) => file.startsWith('grok-') && file.endsWith('.ndjson')),
    )('sums the per-call usage of %s to its reported turn totals', (file) => {
      const totals = turnTotals(file);
      const calls = recordedCalls(file);
      if (totals.length === 0) {
        // No reported turn total (a refused or failed turn): nothing to match.
        return;
      }
      expect(sum(calls)).toEqual(sum(totals));
    });

    it('reads nothing from other notifications or malformed counters', () => {
      expect(usageOf('_x.ai/session_notification', { update: { sessionUpdate: 'turn_completed' } })).toBeUndefined();
      expect(usageOf('_x.ai/queue/changed', { update: { sessionUpdate: 'response_completed', usage: { input_tokens: 1, output_tokens: 1 } } })).toBeUndefined();
      expect(usageOf('_x.ai/mcp/servers_updated', { mcpServers: [] })).toBeUndefined();
      for (const usage of [
        { input_tokens: -1, output_tokens: 1 },
        { input_tokens: 1.5, output_tokens: 1 },
        { input_tokens: '1', output_tokens: 1 },
        { output_tokens: 1 },
        { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: -2 },
      ]) {
        expect(usageOf('_x.ai/session_notification', { update: { sessionUpdate: 'response_completed', usage } })).toBeUndefined();
      }
      expect(usageOf('_x.ai/session_notification', {})).toBeUndefined();
    });

    it('reports a malformed response_completed frame, and no other frame (M2)', () => {
      const hook = grokAcpProfile.extensions?.usage;
      if (!hook) throw new Error('extensions.usage missing');
      const malformed = jest.fn();
      hook('_x.ai/session_notification', { update: { sessionUpdate: 'turn_completed' } }, malformed);
      hook('_x.ai/session_notification', {}, malformed);
      hook('_x.ai/mcp/servers_updated', { update: { sessionUpdate: 'response_completed' } }, malformed);
      expect(malformed).not.toHaveBeenCalled();
      expect(
        hook('_x.ai/session_notification', { update: { sessionUpdate: 'response_completed', usage: { output_tokens: 1 } } }, malformed),
      ).toBeUndefined();
      expect(malformed).toHaveBeenCalledWith(['update.usage.input_tokens']);
    });

    it('counts cache-creation input like cached input', () => {
      expect(
        usageOf('_x.ai/session_notification', {
          update: {
            sessionUpdate: 'response_completed',
            usage: { input_tokens: 10, output_tokens: 3, cache_read_input_tokens: 5, cache_creation_input_tokens: 2 },
          },
        }),
      ).toEqual({ inputTokens: 17, outputTokens: 3 });
    });
  });

  describe('describeError (grok-p3 fixture payloads)', () => {
    const describe_ = grokAcpProfile.describeError;
    if (!describe_) throw new Error('describeError missing');

    it('-32003 on session/prompt with string data names the rate limit detail', () => {
      const error = fixtureError(
        'grok-p3-rate-limited-429.ndjson',
        'session/prompt',
      );
      expect(error.code).toBe(-32003);
      expect(typeof error.data).toBe('string');
      expect(describe_(failure({ method: 'session/prompt', ...error }))).toBe(
        `Grok is rate limited: ${String(error.data)}`,
      );
    });

    it('-32003 on session/prompt with object data reads its message', () => {
      const error = fixtureError(
        'grok-p3-rate-limited-429.ndjson',
        'session/prompt',
      );
      const detail = String(error.data);
      expect(
        describe_(
          failure({
            method: 'session/prompt',
            code: error.code,
            message: error.message,
            data: { message: detail, status: 429 },
          }),
        ),
      ).toBe(`Grok is rate limited: ${detail}`);
    });

    it('-32003 without data falls back to the error message', () => {
      expect(
        describe_(
          failure({
            method: 'session/prompt',
            code: -32003,
            message: 'Rate limited',
          }),
        ),
      ).toBe('Grok is rate limited: Rate limited');
    });

    it.each(['session/new', 'session/resume', 'session/prompt'] as const)(
      '-32000 with the signed-out auth wording on %s asks for `grok login`',
      (method) => {
        const error = fixtureError('grok-p3-signed-out.ndjson', 'session/new');
        expect(error.code).toBe(-32000);
        expect(describe_(failure({ ...error, method }))).toBe(
          'Grok is not signed in: run `grok login`',
        );
      },
    );

    it('-32000 matches the auth wording in the message alone', () => {
      expect(
        describe_(
          failure({
            method: 'session/prompt',
            code: -32000,
            message: 'Authentication required',
          }),
        ),
      ).toBe('Grok is not signed in: run `grok login`');
    });

    it('-32000 with an unrelated message that merely contains "auth" falls through', () => {
      expect(
        describe_(
          failure({
            method: 'session/prompt',
            code: -32000,
            message: 'Internal error',
            data: 'author field missing in commit metadata',
          }),
        ),
      ).toBeUndefined();
    });

    it('-32000 without auth wording falls through to the generic text', () => {
      expect(
        describe_(
          failure({
            method: 'session/new',
            code: -32000,
            message: 'Internal server error',
            data: 'workspace index failed',
          }),
        ),
      ).toBeUndefined();
    });

    it('-32602 on the model config names the model, its source and the advertised values', () => {
      const file = 'grok-p3-set-model-unknown.ndjson';
      const error = fixtureError(file, 'session/set_config_option');
      expect(error.code).toBe(-32602);
      expect(error.data).toBe('unknown model id');
      const model = String(error.params['value']);
      const advertised = advertisedModels(file);
      expect(advertised).toEqual(['grok-4.7']);

      expect(
        describe_(
          failure({
            method: 'session/set_config_option',
            code: error.code,
            message: error.message,
            data: error.data,
            configId: 'model',
            configValue: model,
            advertisedValues: advertised,
            options: { ...BASE_OPTIONS, model, modelSource: 'setting' },
          }),
        ),
      ).toBe(
        "Grok rejected model 'nonexistent-model' (from the `agentOrchestration.grokModel` setting); available models: grok-4.7",
      );
    });

    it.each([
      ['request', 'the spawn request'],
      ['ptah-default', "Ptah's lane default"],
      [
        undefined,
        'the `agentOrchestration.grokModel` setting or the spawn request',
      ],
    ] as const)(
      'names model source %s and points at `grok models` when nothing is advertised',
      (modelSource, wording) => {
        expect(
          describe_(
            failure({
              method: 'session/set_config_option',
              code: -32602,
              message: 'Invalid params',
              data: 'unknown model id',
              configId: 'model',
              configValue: 'nope',
              advertisedValues: [],
              options: { ...BASE_OPTIONS, model: 'nope', modelSource },
            }),
          ),
        ).toBe(
          `Grok rejected model 'nope' (from ${wording}); run \`grok models\` to see the available models`,
        );
      },
    );

    it('leaves every other failure to the generic message', () => {
      expect(
        describe_(
          failure({
            method: 'session/set_config_option',
            code: -32602,
            message: 'Invalid params',
            configId: 'reasoning_effort',
            configValue: 'xhigh',
          }),
        ),
      ).toBeUndefined();
      expect(
        describe_(
          failure({ method: 'session/new', code: -32003, message: 'x' }),
        ),
      ).toBeUndefined();
      expect(
        describe_(
          failure({ method: 'session/prompt', code: -32000, message: 'x' }),
        ),
      ).toBeUndefined();
      expect(
        describe_(
          failure({ method: 'initialize', code: -32603, message: 'boom' }),
        ),
      ).toBeUndefined();
    });
  });
});

describe('grokAcpProfile.hiddenLaneCommands', () => {
  it('hides only the permission-policy command Grok advertises', () => {
    expect(grokAcpProfile.hiddenLaneCommands).toEqual(['always-approve']);
    const advertised = readEnvelopes('grok-plain-turn.ndjson')
      .map((envelope) => envelope.msg?.params?.['update'])
      .filter((update): update is { sessionUpdate: string; availableCommands: { name: string }[] } =>
        typeof update === 'object' && update !== null &&
        (update as { sessionUpdate?: unknown }).sessionUpdate === 'available_commands_update')
      .at(-1)?.availableCommands.map((command) => command.name) ?? [];
    expect(advertised).toContain('always-approve');
  });
});
