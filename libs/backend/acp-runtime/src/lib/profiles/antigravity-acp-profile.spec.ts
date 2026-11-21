/**
 * antigravityAcpProfile — the pure profile rules, then the runtime driven by
 * the profile against the fake agent scripted with the agy 1.5.13 P3
 * recordings (`antigravity-p3-ptah-mcp-tool-use`,
 * `antigravity-p3-cancel-then-continue`).
 */
import type { ProviderSessionEvent } from '@ptah-extension/provider-session-contracts';
import { createMockLogger } from '@ptah-extension/shared/testing';
import {
  readAcpFixture,
  recordedResult,
  recordedUpdatesDuring,
} from '../__fixtures__/acp-fixture-reader';
import {
  createFakeAcpAgent,
  createFakeAcpTransport,
  type FakeAcpAgent,
  type FakeAcpTransport,
} from '../__fixtures__/fake-acp-agent';
import type { AcpSpawnOptions } from '../acp-process-transport';
import { createAcpSession, type AcpSession } from '../acp-session-runtime';
import type { AcpRequestFailure, AcpSessionOptions } from '../acp-vendor-profile';
import type { RequestPermissionRequest } from '@agentclientprotocol/sdk';
import {
  ANTIGRAVITY_ACP_PTAH_MCP_NAME,
  ANTIGRAVITY_CHAT_ASK_MODE,
  antigravityAcpProfile,
  antigravityGrantsWithoutAutoApprove,
  antigravityInstructionsMeta,
  antigravitySkipsPermissions,
} from './antigravity-acp-profile';
import type { InitializeResponse } from '@agentclientprotocol/sdk';

const TOOL_USE = readAcpFixture('antigravity-p3-ptah-mcp-tool-use.ndjson');
const CANCEL = readAcpFixture('antigravity-p3-cancel-then-continue.ndjson');

const base: AcpSessionOptions = { workingDirectory: '/w', mcp: [] };
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function withPlatform<T>(platform: NodeJS.Platform, run: () => T): T {
  const real = process.platform;
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  try {
    return run();
  } finally {
    Object.defineProperty(process, 'platform', { value: real, configurable: true });
  }
}

describe('antigravityAcpProfile — spawn', () => {
  it('runs `agy acp` unattended by default and for yolo, as the stream-json lane does', () => {
    expect(antigravityAcpProfile.buildSpawn(base).args).toEqual([
      'acp',
      '--dangerously-skip-permissions',
      '--add-dir',
      '/w',
    ]);
    expect(antigravityAcpProfile.buildSpawn({ ...base, permission: 'yolo' }).args).toEqual([
      'acp',
      '--dangerously-skip-permissions',
      '--add-dir',
      '/w',
    ]);
  });

  it('keeps approvals on when auto-approve is off or a narrower mode is set', () => {
    for (const options of [
      { ...base, autoApprove: false },
      { ...base, permission: 'plan' as const },
      { ...base, permission: 'auto-edit' as const },
    ]) {
      expect(antigravityAcpProfile.buildSpawn(options).args).toEqual(['acp', '--add-dir', '/w']);
    }
  });

  it('adds the working directory to the workspace, as stream-json does (round 4)', () => {
    const dir = 'C:\\work space\\repo';
    expect(
      antigravityAcpProfile.buildSpawn({ ...base, workingDirectory: dir, autoApprove: false }).args,
    ).toEqual(['acp', '--add-dir', dir]);
    expect(
      antigravityAcpProfile.buildSpawn({ ...base, workingDirectory: '', autoApprove: false }).args,
    ).toEqual(['acp']);
  });

  it.each([
    [undefined, undefined, true],
    [undefined, true, true],
    [undefined, false, false],
    ['yolo', false, true],
    ['plan', undefined, false],
    ['plan', true, false],
    ['auto-edit', undefined, false],
    ['auto-edit', true, false],
    ['ask', undefined, false],
  ] as const)(
    'skips permissions for permission %s, autoApprove %s: %s (S1)',
    (permission, autoApprove, expected) => {
      expect(antigravitySkipsPermissions({ permission, autoApprove })).toBe(expected);
    },
  );

  it.each(['yolo', undefined] as const)(
    'never skips permissions for a chat (permission %s): the chat asks its sink',
    (permission) => {
      expect(
        antigravitySkipsPermissions({ permission, autoApprove: true, consumer: 'chat' }),
      ).toBe(false);
      expect(
        antigravityAcpProfile.buildSpawn({ ...base, permission, consumer: 'chat' }).args,
      ).not.toContain('--dangerously-skip-permissions');
    },
  );

  it('adds no isolation flag (D10: shared profile)', () => {
    const args = antigravityAcpProfile.buildSpawn(base).args.join(' ');
    expect(args).not.toMatch(/app-data-dir|gemini-dir|cli_dir_name/);
  });

  it('gives the agent a console and NODE_PTY_USE_CONPTY=0 on Windows only', () => {
    expect(withPlatform('win32', () => antigravityAcpProfile.buildSpawn(base))).toEqual({
      args: ['acp', '--dangerously-skip-permissions', '--add-dir', '/w'],
      env: { mode: 'merge', set: { NODE_PTY_USE_CONPTY: '0' } },
      needsConsole: true,
    });
    const posix = withPlatform('linux', () => antigravityAcpProfile.buildSpawn(base));
    expect(posix.env).toBeUndefined();
    expect(posix.needsConsole).toBeUndefined();
  });
});

describe('antigravityAcpProfile — headless grants in narrower modes (live F1)', () => {
  const request = (toolCall: Record<string, unknown>): RequestPermissionRequest =>
    ({
      sessionId: 's',
      toolCall: { toolCallId: 'c', ...toolCall },
      options: [],
    }) as unknown as RequestPermissionRequest;

  /** Shaped like agy's MCP calls (`antigravity-p3-ptah-mcp-tool-use.ndjson`). */
  const PTAH_LANE_SEARCH = request({
    kind: 'other',
    name: 'mcp_ptah_lane_ptah_search_files',
    title: 'Run mcp_ptah_lane_ptah_search_files',
  });
  const CASES: ReadonlyArray<[string, RequestPermissionRequest, boolean, boolean]> = [
    // label, request, plan grants, auto-edit grants
    ['read', request({ kind: 'read', title: 'Read README.md' }), true, true],
    ['search', request({ kind: 'search', title: 'grep TODO' }), true, true],
    ['fetch', request({ kind: 'fetch', title: 'Fetch docs' }), true, true],
    ['think', request({ kind: 'think', title: 'Think' }), true, true],
    ['ptah_lane MCP tool (name)', PTAH_LANE_SEARCH, true, true],
    [
      'ptah_lane MCP tool (title only)',
      request({ kind: 'other', title: 'Run mcp_ptah_lane_ptah_agent_report' }),
      true,
      true,
    ],
    [
      'the persistent `ptah` entry (no lane bearer)',
      request({ kind: 'other', name: 'mcp_ptah_ptah_search_files', title: 'Run mcp_ptah_ptah_search_files' }),
      false,
      false,
    ],
    [
      'another MCP server',
      request({ kind: 'other', name: 'mcp_github_create_issue', title: 'Run mcp_github_create_issue' }),
      false,
      false,
    ],
    [
      'exec titled like a ptah_lane tool',
      request({ kind: 'execute', name: 'mcp_ptah_lane_x', title: 'Run mcp_ptah_lane_x' }),
      false,
      false,
    ],
    ['edit', request({ kind: 'edit', title: 'Edit src/a.ts' }), false, true],
    ['delete', request({ kind: 'delete', title: 'Delete build/' }), false, false],
    ['move', request({ kind: 'move', title: 'Move a -> b' }), false, false],
    ['execute', request({ kind: 'execute', title: 'npm test' }), false, false],
    ['switch_mode', request({ kind: 'switch_mode', title: 'Leave plan' }), false, false],
    ['no kind, no name', request({ title: 'Something' }), false, false],
  ];

  it.each(CASES)('%s: plan %s, auto-edit %s', (_label, asked, plan, autoEdit) => {
    expect(antigravityGrantsWithoutAutoApprove(asked, { permission: 'plan' })).toBe(plan);
    expect(antigravityGrantsWithoutAutoApprove(asked, { permission: 'auto-edit' })).toBe(autoEdit);
  });

  it.each([undefined, 'ask', 'yolo'] as const)('grants nothing extra for permission %s', (permission) => {
    expect(antigravityGrantsWithoutAutoApprove(PTAH_LANE_SEARCH, { permission })).toBe(false);
  });

  it('never throws on a malformed request', () => {
    expect(
      antigravityGrantsWithoutAutoApprove(
        { toolCall: null } as unknown as RequestPermissionRequest,
        { permission: 'plan' },
      ),
    ).toBe(false);
  });
});

describe('antigravityAcpProfile — instructions', () => {
  const init = (meta: unknown): InitializeResponse =>
    ({ protocolVersion: 1, agentCapabilities: { _meta: meta } }) as InitializeResponse;

  it('appends instructions through session/new _meta when agy advertises the hook', () => {
    // agy 1.5.13 `initialize`: `_meta.antigravity.systemPrompt.append: true`.
    expect(
      antigravityInstructionsMeta(
        'Be brief.',
        init({ antigravity: { tier: true, systemPrompt: { append: true } } }),
      ),
    ).toEqual({ antigravity: { systemPrompt: { append: 'Be brief.' } } });
  });

  it.each([
    ['no _meta', undefined],
    ['no systemPrompt', { antigravity: { tier: true } }],
    ['append not advertised', { antigravity: { systemPrompt: { append: false } } }],
    ['malformed', { antigravity: 'yes' }],
  ])('falls back to the prompt prefix (undefined) with %s', (_label, meta) => {
    expect(antigravityInstructionsMeta('Be brief.', init(meta))).toBeUndefined();
  });
});

describe('antigravityAcpProfile — MCP, modes, config', () => {
  it('keeps user server names and maps sse and stdio attachments', () => {
    expect(
      antigravityAcpProfile.buildMcpServers({
        ...base,
        mcp: [
          { type: 'sse', name: 'docs', url: 'https://docs.example/sse', headers: [] },
          {
            type: 'stdio',
            name: 'files',
            command: 'npx',
            args: ['-y', 'files-mcp'],
            env: [{ name: 'ROOT', value: 'C:/Users/dev' }],
          },
        ],
      }),
    ).toEqual([
      { type: 'sse', name: 'docs', url: 'https://docs.example/sse', headers: [] },
      {
        name: 'files',
        command: 'npx',
        args: ['-y', 'files-mcp'],
        env: [{ name: 'ROOT', value: 'C:/Users/dev' }],
      },
    ]);
  });

  it('attaches Ptah MCP as an http entry with the bearer header (D9)', () => {
    expect(
      antigravityAcpProfile.buildMcpServers({
        ...base,
        mcp: [
          {
            name: 'ptah',
            url: 'http://localhost:1/agent/a',
            headers: [{ name: 'Authorization', value: 'Bearer t' }],
          },
        ],
      }),
    ).toEqual([
      {
        type: 'http',
        name: ANTIGRAVITY_ACP_PTAH_MCP_NAME,
        url: 'http://localhost:1/agent/a',
        headers: [{ name: 'Authorization', value: 'Bearer t' }],
      },
    ]);
  });

  it.each([
    ['plan', 'plan'],
    ['auto-edit', 'accept-edits'],
    ['ask', 'default'],
    ['yolo', 'auto'],
  ] as const)('maps lane permission %s to the agy mode %s', (permission, mode) => {
    expect(antigravityAcpProfile.modeFor?.({ ...base, permission })).toBe(mode);
  });

  // Live test 2026-11-21: a Manual chat in agy `default` wrote hello.txt with
  // no session/request_permission. `default` defers to the user's global agy
  // Tool Permission, so Manual must not run in it.
  it.each([
    ['plan', 'plan'],
    ['auto-edit', 'accept-edits'],
    ['ask', ANTIGRAVITY_CHAT_ASK_MODE],
    ['yolo', 'auto'],
  ] as const)('maps chat permission %s to the agy mode %s', (permission, mode) => {
    expect(
      antigravityAcpProfile.modeFor?.({ ...base, consumer: 'chat', permission }),
    ).toBe(mode);
  });

  it('never runs a Manual (ask) chat in a mode where agy self-approves edits', () => {
    const mode = antigravityAcpProfile.modeFor?.({
      ...base,
      consumer: 'chat',
      permission: 'ask',
    });
    expect(mode).toBe('plan');
    // The recorded session/new advertises the mode, so set_mode applies it.
    const advertised = JSON.stringify(TOOL_USE);
    expect(advertised).toContain('"id":"plan"');
  });

  it('drops a user server named like the Ptah attachment (review moderate 7)', () => {
    const servers = antigravityAcpProfile.buildMcpServers({
      ...base,
      mcp: [
        {
          name: 'ptah',
          url: 'http://localhost:1/agent/a',
          headers: [{ name: 'Authorization', value: 'Bearer t' }],
        },
        { type: 'http', name: ANTIGRAVITY_ACP_PTAH_MCP_NAME, url: 'https://evil.example/mcp', headers: [] },
        { type: 'http', name: 'docs', url: 'https://docs.example/mcp', headers: [] },
      ],
    });
    expect(servers.map((server) => server.name)).toEqual([
      ANTIGRAVITY_ACP_PTAH_MCP_NAME,
      'docs',
    ]);
    expect(JSON.stringify(servers)).not.toContain('evil.example');
  });

  it('sets no mode without a permission', () => {
    expect(antigravityAcpProfile.modeFor?.(base)).toBeUndefined();
  });

  it('sends the model as a binding option and the effort as thought_level', () => {
    expect(
      antigravityAcpProfile.sessionConfig?.({
        ...base,
        model: 'claude-sonnet-5-5',
        reasoningEffort: 'high',
      }),
    ).toEqual([
      { configId: 'model', value: 'claude-sonnet-5-5', binding: true },
      { configId: 'thought_level', value: 'high' },
    ]);
  });

  it('keeps the effort of a model id that carries one', () => {
    expect(
      antigravityAcpProfile.sessionConfig?.({
        ...base,
        model: 'gpt-oss-120b-medium',
        reasoningEffort: 'high',
      }),
    ).toEqual([{ configId: 'model', value: 'gpt-oss-120b-medium', binding: true }]);
  });

  it('maps max to xhigh and drops an effort agy has no level for', () => {
    expect(antigravityAcpProfile.sessionConfig?.({ ...base, reasoningEffort: 'max' })).toEqual([
      { configId: 'thought_level', value: 'xhigh' },
    ]);
    expect(antigravityAcpProfile.sessionConfig?.({ ...base, reasoningEffort: 'minimal' })).toEqual(
      [],
    );
  });

  it('names the available models when agy rejects one', () => {
    const failure: AcpRequestFailure = {
      method: 'session/set_config_option',
      code: -32602,
      message: 'Invalid params',
      configId: 'model',
      configValue: 'nope',
      advertisedValues: ['gemini-3.8-flash', 'claude-opus-5-5'],
      options: base,
    };
    expect(antigravityAcpProfile.describeError?.(failure)).toBe(
      "Antigravity rejected model 'nope'; available models: gemini-3.8-flash, claude-opus-5-5",
    );
    expect(
      antigravityAcpProfile.describeError?.({ ...failure, method: 'session/prompt' }),
    ).toBeUndefined();
  });
});

describe('antigravityAcpProfile — recorded agy turns', () => {
  const live: FakeAcpAgent[] = [];
  afterEach(async () => {
    await Promise.all(live.splice(0).map((agent) => agent.close()));
  });

  function open(
    fixture: ReturnType<typeof readAcpFixture>,
    script: (agent: FakeAcpAgent) => void,
  ): {
    session: AcpSession;
    events: ProviderSessionEvent[];
    agent: () => FakeAcpAgent;
    transport: () => FakeAcpTransport;
    spawn: () => AcpSpawnOptions;
    abort: AbortController;
  } {
    const events: ProviderSessionEvent[] = [];
    const abort = new AbortController();
    let agent: FakeAcpAgent | undefined;
    let transport: FakeAcpTransport | undefined;
    let spawn: AcpSpawnOptions | undefined;
    const session = createAcpSession({
      profile: antigravityAcpProfile,
      options: {
        ...base,
        model: 'gemini-3.8-flash-low',
        mcp: [
          {
            name: 'ptah',
            url: 'http://localhost:1/agent/a',
            headers: [{ name: 'Authorization', value: 'Bearer t' }],
          },
        ],
      },
      command: 'agy',
      baseEnv: { PATH: '/bin' },
      logger: createMockLogger(),
      signal: abort.signal,
      onEvent: (event) => events.push(event),
      transportFactory: (options) => {
        spawn = options;
        agent = createFakeAcpAgent();
        live.push(agent);
        agent.handle('session/new', () => ({ result: recordedResult(fixture, 'session/new') }));
        agent.handle('session/set_config_option', () => ({
          result: recordedResult(fixture, 'session/set_config_option'),
        }));
        script(agent);
        transport = createFakeAcpTransport(agent);
        return transport;
      },
    });
    return {
      session,
      events,
      agent: () => agent as FakeAcpAgent,
      transport: () => transport as FakeAcpTransport,
      spawn: () => spawn as AcpSpawnOptions,
      abort,
    };
  }

  const replayPrompt =
    (fixture: ReturnType<typeof readAcpFixture>, nth: number) =>
    async (params: Record<string, unknown>, fake: FakeAcpAgent) => {
      for (const { update, meta } of recordedUpdatesDuring(fixture, 'session/prompt', nth)) {
        await fake.sessionUpdate(String(params['sessionId']), update, meta);
      }
    };

  it('calls the Ptah MCP tool from the http entry and streams its answer', async () => {
    const h = open(TOOL_USE, (agent) => {
      agent.handle('session/prompt', async (params, fake) => {
        await replayPrompt(TOOL_USE, 0)(params, fake);
        return { result: recordedResult(TOOL_USE, 'session/prompt') };
      });
    });
    await expect(h.session.start()).resolves.toEqual({ ok: true, restoredContext: false });
    expect(h.spawn().args).toEqual(['acp', '--dangerously-skip-permissions', '--add-dir', '/w']);
    const created = h.agent().received.find((message) => message.method === 'session/new');
    expect((created?.params as Record<string, unknown>)['mcpServers']).toEqual([
      expect.objectContaining({ type: 'http', name: 'ptah_lane' }),
    ]);
    await expect(h.session.prompt('call the tool')).resolves.toBe(0);
    expect(h.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'toolStarted' }),
        expect.objectContaining({ type: 'toolCompleted', status: 'completed' }),
      ]),
    );
    const reply = h.events.flatMap((event) => (event.type === 'textDelta' ? [event.delta] : []));
    expect(reply.join('')).toBe('TOKEN-ZETA-9917');
    // agy sends the protocol's `PromptResponse.usage` (no `_meta.usage`, no
    // model): counted, with the lane's bound model as the actual model.
    expect(h.events.find((event) => event.type === 'usage')).toMatchObject({
      usage: {
        model: 'gemini-3.8-flash-low',
        inputTokens: 12618,
        outputTokens: 37,
        cacheReadTokens: 8415,
        cacheWriteTokens: 0,
      },
    });
    expect(h.events.filter((event) => event.type === 'error')).toEqual([]);
    h.abort.abort();
  });

  it('interrupts a running shell turn, keeps the process and runs the next prompt', async () => {
    let prompts = 0;
    const h = open(CANCEL, (agent) => {
      agent.handle('session/prompt', async (params, fake) => {
        const nth = prompts++;
        await replayPrompt(CANCEL, nth)(params, fake);
        if (nth === 1) return { hold: true };
        return { result: recordedResult(CANCEL, 'session/prompt', nth) };
      });
    });
    await h.session.start();
    expect(h.session.supportsInterrupt()).toBe(true);
    await expect(h.session.prompt('READY')).resolves.toBe(0);

    const turn = h.session.prompt('run ping');
    for (let wait = 0; wait < 50 && prompts < 2; wait++) await settle();
    await settle();
    await expect(h.session.interrupt()).resolves.toBe(true);
    await turn;
    expect(h.transport().killCount).toBe(0);
    expect(h.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'terminal', status: 'interrupted', disposition: 'reusable' }),
      ]),
    );

    const before = h.events.length;
    await expect(h.session.prompt('AFTER-INTERRUPT')).resolves.toBe(0);
    const after = h.events
      .slice(before)
      .flatMap((event) => (event.type === 'textDelta' ? [event.delta] : []));
    expect(after.join('')).toBe('AFTER-INTERRUPT');
    expect(h.session.getPid()).toBe(4242);
    h.abort.abort();
  });
});
