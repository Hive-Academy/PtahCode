/**
 * createAcpProviderSessionRuntime — the chat `ProviderSessionRuntime` against
 * the scripted fake ACP agent: open (new, resume, load with replay, a failed
 * attach), capabilities and models from the advertisement, prompt content
 * (text, image, file), the runtime-level image guard, instructions delivery
 * (`session/new` `_meta` vs prompt prefix, never on restore), MCP mapping,
 * process exit, and close.
 */
import type {
  ProviderApprovalSink,
  ProviderMcpAttachment,
  ProviderSession,
  ProviderSessionEvent,
  ProviderSessionOpenRequest,
} from '@ptah-extension/provider-session-contracts';
import type { IProcessSpawner } from '@ptah-extension/platform-core';
import { createMockLogger } from '@ptah-extension/shared/testing';
import {
  createFakeAcpAgent,
  createFakeAcpTransport,
  type FakeAcpAgent,
  type FakeAcpAgentOptions,
  type FakeAcpMessage,
  type FakeAcpTransport,
} from './__fixtures__/fake-acp-agent';
import {
  AcpProviderSessionError,
  createAcpProviderSessionRuntime,
} from './acp-provider-session-runtime';
import { acpInstructionsPrefix } from './acp-session-runtime';
import type { AcpVendorProfile } from './acp-vendor-profile';
import {
  ANTIGRAVITY_ACP_PTAH_MCP_NAME,
  ANTIGRAVITY_PLAN_EXIT_TITLE,
  antigravityAcpProfile,
} from './profiles/antigravity-acp-profile';

const SESSION_ID = 'agy-sess-1';
const INSTRUCTIONS = 'You are Ptah. Answer briefly.';

/** agy 1.5.13's advertisement (`antigravity-p2-handshake.ndjson`). */
const AGY_CAPABILITIES = {
  loadSession: true,
  promptCapabilities: { image: true, audio: false, embeddedContext: true },
  sessionCapabilities: { resume: {}, load: {} },
  _meta: { antigravity: { tier: true, systemPrompt: { append: true } } },
};

const AGY_SESSION_REPLY = {
  sessionId: SESSION_ID,
  models: {
    availableModels: [
      { modelId: 'gemini-4-hydrogen-low', name: 'Gemini 4 Hydrogen (Low)' },
      { modelId: 'gemini-4-hydrogen-high', name: 'Gemini 4 Hydrogen (High)' },
    ],
    currentModelId: 'gemini-4-hydrogen-high',
  },
  modes: {
    currentModeId: 'default',
    availableModes: [
      { id: 'default', name: 'Default' },
      { id: 'accept-edits', name: 'Accept edits' },
      { id: 'auto', name: 'Auto' },
      { id: 'plan', name: 'Plan' },
    ],
  },
  configOptions: [
    {
      id: 'model',
      category: 'model',
      type: 'select',
      currentValue: 'gemini-4-hydrogen',
      options: [{ value: 'gemini-4-hydrogen', name: 'Gemini 4 Hydrogen' }],
    },
    {
      id: 'thought_level',
      category: 'thought_level',
      type: 'select',
      currentValue: 'high',
      options: [{ value: 'low' }, { value: 'medium' }, { value: 'high' }, { value: 'xhigh' }],
    },
  ],
};

/** A vendor-neutral profile with no system-prompt hook. */
const plainProfile: AcpVendorProfile = {
  vendor: 'grok',
  displayName: 'Plain Agent',
  signInHint: 'run `plain login`',
  cancelBehavior: 'await-reply',
  buildSpawn: () => ({ args: ['agent', 'stdio'] }),
  buildMcpServers: () => [],
};

const approvals: ProviderApprovalSink = {
  request: jest.fn(async () => 'decline' as const),
};

const live: FakeAcpAgent[] = [];

interface Harness {
  readonly agent: FakeAcpAgent;
  readonly transport: FakeAcpTransport;
  open(
    overrides?: Partial<ProviderSessionOpenRequest>,
    signal?: AbortSignal,
  ): Promise<ProviderSession>;
}

function harness(
  agentOptions: FakeAcpAgentOptions = {},
  script?: (agent: FakeAcpAgent) => void,
  profiles: readonly AcpVendorProfile[] = [antigravityAcpProfile, plainProfile],
): Harness {
  const agent = createFakeAcpAgent({
    sessionId: SESSION_ID,
    agentCapabilities: AGY_CAPABILITIES,
    // agy advertises its modes on every session reply; a Manual chat needs `plan`.
    modes: AGY_SESSION_REPLY.modes,
    ...agentOptions,
  });
  live.push(agent);
  agent.handle('session/set_mode', () => ({ result: {} }));
  script?.(agent);
  const transport = createFakeAcpTransport(agent);
  const runtime = createAcpProviderSessionRuntime({
    spawner: {} as IProcessSpawner,
    logger: createMockLogger(),
    profiles,
    transportFactory: () => transport,
  });
  return {
    agent,
    transport,
    open: (overrides = {}, signal) =>
      runtime.open(
        {
          profile: 'antigravity',
          binaryPath: 'agy',
          policy: { permission: 'ask', cwd: process.cwd() },
          mcp: [],
          approvals,
          baseEnv: { PATH: '/bin' },
          consumer: 'chat',
          runId: 'chat-1',
          ...overrides,
        },
        signal,
      ),
  };
}

const sent = (agent: FakeAcpAgent, method: string): FakeAcpMessage[] =>
  agent.received.filter((message) => message.method === method);

const params = (message: FakeAcpMessage | undefined): Record<string, unknown> =>
  (message?.params ?? {}) as Record<string, unknown>;

/** Collect one subscription's events until its terminal. */
async function untilTerminal(
  session: ProviderSession,
  run: () => Promise<unknown>,
): Promise<ProviderSessionEvent[]> {
  const abort = new AbortController();
  const events: ProviderSessionEvent[] = [];
  const iterator = session.events(abort.signal)[Symbol.asyncIterator]();
  await run();
  for (;;) {
    const next = await iterator.next();
    if (next.done) break;
    events.push(next.value);
    if (next.value.type === 'terminal') break;
  }
  abort.abort();
  return events;
}

/** Wait for a matching `session/prompt` request and answer it via the default handler. */
const promptsOf = (agent: FakeAcpAgent): unknown[][] =>
  sent(agent, 'session/prompt').map((message) => params(message)['prompt'] as unknown[]);

afterEach(async () => {
  await Promise.all(live.splice(0).map((agent) => agent.close()));
});

describe('createAcpProviderSessionRuntime: open', () => {
  it('opens a new session with the advertised capabilities and models', async () => {
    const { agent, open } = harness({}, (fake) => {
      fake.handle('session/new', () => ({ result: AGY_SESSION_REPLY }));
    });
    const session = await open();

    expect(session.nativeSessionId).toBe(SESSION_ID);
    expect(session.restoredContext).toBe(false);
    expect(session.replay).toEqual([]);
    expect(session.processGeneration).toBe(1);
    expect(session.capabilities()).toEqual({
      steer: false,
      interrupt: true,
      setModel: true,
      setMode: true,
      images: true,
      resume: true,
      load: true,
      modes: ['default', 'accept-edits', 'auto', 'plan'],
    });
    await expect(session.listModels()).resolves.toEqual([
      { id: 'gemini-4-hydrogen-low', name: 'Gemini 4 Hydrogen (Low)' },
      { id: 'gemini-4-hydrogen-high', name: 'Gemini 4 Hydrogen (High)', isDefault: true },
    ]);
    // The chat's `ask` (Manual) maps to agy's read-only `plan` mode: agy's
    // `default` self-approves workspace edits (live test 2026-11-21). No
    // approve-everything flag.
    expect(sent(agent, 'session/set_mode').map((m) => params(m)['modeId'])).toEqual([
      'plan',
    ]);
    await session.close();
  });

  it('never spawns a chat with an approve-everything flag, even in yolo', async () => {
    const agent = createFakeAcpAgent({ sessionId: SESSION_ID });
    live.push(agent);
    const transport = createFakeAcpTransport(agent);
    let args: readonly string[] = [];
    const runtime = createAcpProviderSessionRuntime({
      spawner: {} as IProcessSpawner,
      logger: createMockLogger(),
      profiles: [antigravityAcpProfile],
      transportFactory: (spawn) => {
        args = spawn.args;
        return transport;
      },
    });
    const session = await runtime.open({
      profile: 'antigravity',
      binaryPath: 'agy',
      policy: { permission: 'yolo', cwd: process.cwd() },
      mcp: [],
      approvals,
      baseEnv: {},
      consumer: 'chat',
      runId: 'chat-yolo',
    });
    expect(args).not.toContain('--dangerously-skip-permissions');
    await session.close();
  });

  it('reports images false when the agent did not advertise image input', async () => {
    const { open } = harness({
      agentCapabilities: { loadSession: false, promptCapabilities: { image: false } },
    });
    const session = await open({ profile: 'grok' });
    expect(session.capabilities()).toMatchObject({
      images: false,
      resume: false,
      load: false,
      steer: false,
    });
    await session.close();
  });

  it('resumes by native id: restored context, no replay', async () => {
    const { agent, open } = harness();
    const session = await open({
      attach: { nativeSessionId: 'old-1', method: 'resume', onFailure: 'error' },
    });
    expect(session.nativeSessionId).toBe('old-1');
    expect(session.restoredContext).toBe(true);
    expect(session.replay).toEqual([]);
    expect(sent(agent, 'session/resume')).toHaveLength(1);
    expect(sent(agent, 'session/new')).toHaveLength(0);
    await session.close();
  });

  it('loads by native id and keeps the replayed history, flagged replayed', async () => {
    const { agent, open } = harness({
      replay: [
        { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'earlier question' } },
        { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'earlier answer' } },
      ],
    });
    const session = await open({
      attach: { nativeSessionId: 'old-2', method: 'load', onFailure: 'error' },
    });
    expect(session.restoredContext).toBe(true);
    expect(sent(agent, 'session/load')).toHaveLength(1);
    expect(session.replay.map((event) => event.type)).toEqual(['userText', 'textDelta']);
    expect(session.replay.every((event) => event.replayed === true)).toBe(true);
    await session.close();
  });

  it('rejects with resume-failed when the attach fails and onFailure is error', async () => {
    const { transport, open } = harness({}, (fake) => {
      fake.handle('session/resume', () => ({ error: { code: -32002, message: 'unknown session' } }));
    });
    const opening = open({
      attach: { nativeSessionId: 'gone-1', method: 'resume', onFailure: 'error' },
    });
    await expect(opening).rejects.toBeInstanceOf(AcpProviderSessionError);
    await expect(opening).rejects.toMatchObject({ code: 'resume-failed' });
    await transport.exited;
  });

  it('starts a new session when the attach fails and onFailure is new-session', async () => {
    const { agent, open } = harness({}, (fake) => {
      fake.handle('session/resume', () => ({ error: { code: -32002, message: 'unknown session' } }));
    });
    const session = await open({
      instructions: INSTRUCTIONS,
      attach: { nativeSessionId: 'gone-2', method: 'resume', onFailure: 'new-session' },
    });
    expect(session.nativeSessionId).toBe(SESSION_ID);
    expect(session.restoredContext).toBe(false);
    // A new session is owed its instructions even though an attach was asked.
    expect(params(sent(agent, 'session/new')[0])['_meta']).toEqual({
      antigravity: { systemPrompt: { append: INSTRUCTIONS } },
    });
    await session.close();
  });

  it('rejects with the setup error code (auth-required) and stops the agent', async () => {
    const { transport, open } = harness({}, (fake) => {
      fake.handle('session/new', () => ({ error: { code: -32000, message: 'Authentication required' } }));
    });
    await expect(open()).rejects.toMatchObject({ code: 'auth-required' });
    await transport.exited;
  });

  it('rejects for a profile that is not registered', async () => {
    const { open } = harness({}, undefined, [plainProfile]);
    await expect(open({ profile: 'opencode' })).rejects.toMatchObject({
      code: 'protocol-unsupported',
    });
  });

  it('rejects with cancelled when the open signal aborts during setup', async () => {
    const abort = new AbortController();
    const { open } = harness({}, (fake) => {
      fake.handle('session/new', () => {
        abort.abort();
        return { hold: true };
      });
    });
    await expect(open({}, abort.signal)).rejects.toMatchObject({ code: 'cancelled' });
  });
});

describe('createAcpProviderSessionRuntime: prompt content', () => {
  it('sends text, image and file blocks; a Windows path becomes a file URI', async () => {
    const { agent, open } = harness();
    const session = await open();
    const events = await untilTerminal(session, async () => {
      const receipt = await session.prompt({
        text: 'Describe these',
        images: [{ mimeType: 'image/png', data: 'iVBORw0KGgo=' }],
        files: [{ path: 'C:\\Users\\dev\\project\\notes 1.md', name: 'notes 1.md' }],
      });
      expect(receipt.turnId).toBeTruthy();
    });
    expect(promptsOf(agent)[0]).toEqual([
      { type: 'text', text: 'Describe these' },
      { type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgo=' },
      {
        type: 'resource_link',
        uri: 'file:///C:/Users/dev/project/notes%201.md',
        name: 'notes 1.md',
      },
    ]);
    const terminal = events.at(-1);
    expect(terminal).toMatchObject({
      type: 'terminal',
      status: 'completed',
      disposition: 'reusable',
    });
    // Every event of the turn carries the receipt's turn id.
    expect(new Set(events.map((event) => event.turnId)).size).toBe(1);
    await session.close();
  });

  it('maps a POSIX path to a file URI', async () => {
    const { agent, open } = harness();
    const session = await open();
    await untilTerminal(session, () =>
      session.prompt({ text: '', files: [{ path: '/home/dev/a.ts', name: 'a.ts' }] }),
    );
    expect(promptsOf(agent)[0]).toEqual([
      { type: 'resource_link', uri: 'file:///home/dev/a.ts', name: 'a.ts' },
    ]);
    await session.close();
  });

  it('refuses an image when the agent did not advertise image input, sending nothing', async () => {
    const { agent, open } = harness({ agentCapabilities: { promptCapabilities: { image: false } } });
    const session = await open({ profile: 'grok' });
    await expect(
      session.prompt({ text: 'look', images: [{ mimeType: 'image/png', data: 'AAAA' }] }),
    ).rejects.toMatchObject({ code: 'turn-failed' });
    expect(sent(agent, 'session/prompt')).toHaveLength(0);
    expect(session.isTurnRunning()).toBe(false);
    await session.close();
  });

  it('rejects an overlapping prompt while a turn runs', async () => {
    const { open } = harness({}, (fake) => {
      fake.handle('session/prompt', () => ({ hold: true }));
    });
    const session = await open();
    const { turnId } = await session.prompt({ text: 'first' });
    await expect(session.prompt({ text: 'second' })).rejects.toThrow('still running a turn');
    await expect(session.interrupt(turnId)).resolves.toBe(true);
    await session.close();
  });

  // Bug 5 (live test 2026-11-21): after a restart the chat's run id is the
  // same and the prompt counter restarts, so the loaded process named its
  // first turn like the first turn of the earlier process. The renderer then
  // merged the reply into the old message and showed nothing new.
  it('never reuses the turn id of an earlier process of the same chat run', async () => {
    const first = harness();
    const before = await first.open();
    const { turnId: earlier } = await before.prompt({ text: 'first process' });
    await before.close();
    const second = harness({
      replay: [
        { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'first process' } },
        { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'answer' } },
      ],
    });
    const after = await second.open({
      attach: { nativeSessionId: SESSION_ID, method: 'load', onFailure: 'error' },
    });
    const { turnId: later } = await after.prompt({ text: 'after restart' });
    expect(later).not.toBe(earlier);
    expect(after.replay.some((event) => event.turnId === later)).toBe(false);
    await after.close();
  });

  it('repeats the turn usage on its terminal', async () => {
    const { open } = harness({}, (fake) => {
      fake.handle('session/prompt', () => ({
        result: { stopReason: 'end_turn', usage: { inputTokens: 12, outputTokens: 3 } },
      }));
    });
    const session = await open({ model: 'gemini-4-hydrogen-low' });
    const events = await untilTerminal(session, () => session.prompt({ text: 'hi' }));
    expect(events.at(-1)).toMatchObject({
      type: 'terminal',
      usage: { inputTokens: 12, outputTokens: 3, model: 'gemini-4-hydrogen-low' },
    });
    await session.close();
  });
});

describe('createAcpProviderSessionRuntime: instructions', () => {
  it('delivers instructions through session/new _meta when agy advertises the hook', async () => {
    const { agent, open } = harness();
    const session = await open({ instructions: INSTRUCTIONS });
    expect(params(sent(agent, 'session/new')[0])['_meta']).toEqual({
      antigravity: { systemPrompt: { append: INSTRUCTIONS } },
    });
    await untilTerminal(session, () => session.prompt({ text: 'hello' }));
    expect(promptsOf(agent)[0]).toEqual([{ type: 'text', text: 'hello' }]);
    await session.close();
  });

  it('prefixes the first prompt only when the agent has no hook', async () => {
    const { agent, open } = harness({
      agentCapabilities: { loadSession: true, sessionCapabilities: { resume: {} } },
    });
    const session = await open({ instructions: INSTRUCTIONS });
    expect(params(sent(agent, 'session/new')[0])['_meta']).toBeUndefined();
    await untilTerminal(session, () => session.prompt({ text: 'one' }));
    await untilTerminal(session, () => session.prompt({ text: 'two' }));
    expect(promptsOf(agent)).toEqual([
      [
        { type: 'text', text: acpInstructionsPrefix(INSTRUCTIONS) },
        { type: 'text', text: 'one' },
      ],
      [{ type: 'text', text: 'two' }],
    ]);
    await session.close();
  });

  it('prefixes for a profile without instructionsMeta even when agy-style meta is advertised', async () => {
    const { agent, open } = harness();
    const session = await open({ profile: 'grok', instructions: INSTRUCTIONS });
    expect(params(sent(agent, 'session/new')[0])['_meta']).toBeUndefined();
    await untilTerminal(session, () => session.prompt({ text: 'one' }));
    expect(promptsOf(agent)[0]?.[0]).toEqual({
      type: 'text',
      text: acpInstructionsPrefix(INSTRUCTIONS),
    });
    await session.close();
  });

  it.each(['resume', 'load'] as const)(
    'never re-sends instructions to a session restored by %s',
    async (method) => {
      const { agent, open } = harness({
        agentCapabilities: { loadSession: true, sessionCapabilities: { resume: {} } },
      });
      const session = await open({
        instructions: INSTRUCTIONS,
        attach: { nativeSessionId: 'old-3', method, onFailure: 'error' },
      });
      expect(session.restoredContext).toBe(true);
      await untilTerminal(session, () => session.prompt({ text: 'continue' }));
      expect(promptsOf(agent)[0]).toEqual([{ type: 'text', text: 'continue' }]);
      expect(
        agent.received.some((message) => JSON.stringify(message).includes(INSTRUCTIONS)),
      ).toBe(false);
      await session.close();
    },
  );

  it.each(['resume', 'load'] as const)(
    're-sends the hook _meta on %s only for a profile with instructionsOnRestore meta',
    async (method) => {
      const restoring: AcpVendorProfile = {
        ...antigravityAcpProfile,
        instructionsOnRestore: 'meta',
      };
      const { agent, open } = harness({}, undefined, [restoring]);
      const session = await open({
        instructions: INSTRUCTIONS,
        attach: { nativeSessionId: 'old-4', method, onFailure: 'error' },
      });
      expect(params(sent(agent, `session/${method}`)[0])['_meta']).toEqual({
        antigravity: { systemPrompt: { append: INSTRUCTIONS } },
      });
      // Never as a prompt prefix on a restored session.
      await untilTerminal(session, () => session.prompt({ text: 'continue' }));
      expect(promptsOf(agent)[0]).toEqual([{ type: 'text', text: 'continue' }]);
      await session.close();
    },
  );

  it('agy sends no instructions on restore until the live probe confirms its behaviour', async () => {
    expect(antigravityAcpProfile.instructionsOnRestore).toBe('none');
    const { agent, open } = harness();
    const session = await open({
      instructions: INSTRUCTIONS,
      attach: { nativeSessionId: 'old-5', method: 'resume', onFailure: 'error' },
    });
    expect(params(sent(agent, 'session/resume')[0])['_meta']).toBeUndefined();
    await session.close();
  });
});

describe('createAcpProviderSessionRuntime: spawn report', () => {
  it('reports the pid and the exit of the agent process before open resolves', async () => {
    let resolveSession!: () => void;
    const { transport, open } = harness({}, (fake) => {
      fake.handle(
        'session/new',
        () =>
          new Promise((resolve) => {
            resolveSession = () => resolve({ result: { sessionId: SESSION_ID } });
          }),
      );
    });
    const spawned: { pid: number; exited: Promise<void> }[] = [];
    const opening = open({ onSpawn: (process) => spawned.push(process) });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(spawned.map((process) => process.pid)).toEqual([4242]);
    let exited = false;
    void spawned[0]?.exited.then(() => (exited = true));
    resolveSession();
    const session = await opening;
    await Promise.resolve();
    expect(exited).toBe(false);
    await session.close();
    await spawned[0]?.exited;
    expect(exited).toBe(true);
    expect(transport.killCount).toBe(1);
  });

  it('keeps opening when the caller callback throws', async () => {
    const { open } = harness();
    const session = await open({
      onSpawn: () => {
        throw new Error('ledger down');
      },
    });
    expect(session.nativeSessionId).toBe(SESSION_ID);
    await session.close();
  });
});

describe('createAcpProviderSessionRuntime: MCP attachments', () => {
  it('maps Ptah http, user sse and user stdio attachments to ACP entries', async () => {
    const mcp: ProviderMcpAttachment[] = [
      { name: 'ptah', url: 'http://127.0.0.1:5000/mcp', headers: [{ name: 'Authorization', value: 'Bearer t' }] },
      { type: 'sse', name: 'docs', url: 'https://docs.example/sse', headers: [] },
      {
        type: 'stdio',
        name: 'files',
        command: 'node',
        args: ['server.js', '--root', 'C:/Users/dev/project'],
        env: [{ name: 'TOKEN', value: 'x' }],
      },
    ];
    const { agent, open } = harness();
    const session = await open({ mcp });
    expect(params(sent(agent, 'session/new')[0])['mcpServers']).toEqual([
      {
        type: 'http',
        name: ANTIGRAVITY_ACP_PTAH_MCP_NAME,
        url: 'http://127.0.0.1:5000/mcp',
        headers: [{ name: 'Authorization', value: 'Bearer t' }],
      },
      { type: 'sse', name: 'docs', url: 'https://docs.example/sse', headers: [] },
      {
        name: 'files',
        command: 'node',
        args: ['server.js', '--root', 'C:/Users/dev/project'],
        env: [{ name: 'TOKEN', value: 'x' }],
      },
    ]);
    await session.close();
  });
});

describe('createAcpProviderSessionRuntime: controls', () => {
  it('sets the model, the effort (thought_level) and the permission mode', async () => {
    const { agent, open } = harness({}, (fake) => {
      fake.handle('session/new', () => ({ result: AGY_SESSION_REPLY }));
      fake.handle('session/set_config_option', () => ({
        result: { configOptions: AGY_SESSION_REPLY.configOptions },
      }));
    });
    const session = await open();
    await expect(session.setModel('gemini-4-hydrogen')).resolves.toMatchObject({
      timing: 'effectiveNow',
      revision: 1,
    });
    await expect(session.setEffort('max')).resolves.toMatchObject({ revision: 2 });
    await expect(session.setPermission('auto-edit')).resolves.toMatchObject({ revision: 3 });
    const writes = sent(agent, 'session/set_config_option').map((m) => [
      params(m)['configId'],
      params(m)['value'],
    ]);
    expect(writes).toEqual([
      ['model', 'gemini-4-hydrogen'],
      ['thought_level', 'xhigh'],
    ]);
    expect(sent(agent, 'session/set_mode').map((m) => params(m)['modeId'])).toEqual([
      'plan',
      'accept-edits',
    ]);
    await session.close();
  });

  it('applies no thought_level when the model id carries its own effort', async () => {
    const { agent, open } = harness({}, (fake) => {
      fake.handle('session/new', () => ({ result: AGY_SESSION_REPLY }));
    });
    const session = await open({ model: 'gemini-4-hydrogen-low' });
    await session.setEffort('high');
    expect(
      sent(agent, 'session/set_config_option').filter((m) => params(m)['configId'] === 'thought_level'),
    ).toHaveLength(0);
    await session.close();
  });

  it('rejects a model the agent refuses', async () => {
    const { open } = harness({}, (fake) => {
      fake.handle('session/set_config_option', () => ({
        error: { code: -32602, message: 'Invalid params', data: 'unknown model' },
      }));
    });
    const session = await open();
    await expect(session.setModel('nope')).rejects.toMatchObject({ code: 'request-failed' });
    await session.close();
  });

  it('interrupts only the named running turn and keeps the process', async () => {
    const { transport, open } = harness({}, (fake) => {
      fake.handle('session/prompt', () => ({ hold: true }));
    });
    const session = await open();
    await expect(session.interrupt('no-turn')).resolves.toBe(false);
    const events = await untilTerminal(session, async () => {
      const { turnId } = await session.prompt({ text: 'long task' });
      await expect(session.interrupt('another-turn')).resolves.toBe(false);
      await expect(session.interrupt(turnId)).resolves.toBe(true);
    });
    expect(events.at(-1)).toMatchObject({
      type: 'terminal',
      status: 'interrupted',
      disposition: 'reusable',
    });
    expect(transport.killCount).toBe(0);
    await session.close();
  });
});

describe('createAcpProviderSessionRuntime: process lifetime', () => {
  it('ends a turn with terminal failed/broken when the process exits mid-turn', async () => {
    const owner: { transport?: FakeAcpTransport } = {};
    const h = harness({}, (fake) => {
      fake.handle('session/prompt', () => {
        void owner.transport?.exit(1);
        return { hold: true };
      });
    });
    owner.transport = h.transport;
    const session = await h.open();
    const events = await untilTerminal(session, () => session.prompt({ text: 'crash' }));
    expect(events.at(-1)).toMatchObject({
      type: 'terminal',
      status: 'failed',
      disposition: 'broken',
    });
    expect(events.some((event) => event.type === 'error' && event.error.code === 'process-exited')).toBe(true);
    await session.close();
  });

  it('rejects the next prompt with process-exited after an idle exit', async () => {
    const { transport, open } = harness();
    const session = await open();
    await transport.exit(0);
    await expect(session.prompt({ text: 'hello?' })).rejects.toMatchObject({
      code: 'process-exited',
    });
    await expect(session.setModel('x')).rejects.toMatchObject({ code: 'process-exited' });
    expect(session.getPid()).toBeUndefined();
    await session.close();
  });

  it('close stops the agent, ends subscriptions, and touches nothing of the caller', async () => {
    const sink: ProviderApprovalSink = { request: jest.fn() };
    const { transport, open } = harness();
    const session = await open({ approvals: sink });
    const iterator = session.events(new AbortController().signal)[Symbol.asyncIterator]();
    const pending = iterator.next();
    await session.close();
    await expect(pending).resolves.toEqual({ done: true, value: undefined });
    await expect(session.close()).resolves.toBeUndefined();
    expect(transport.killCount).toBe(1);
    // The pool that minted the MCP credential revokes it; close asks nothing.
    expect(sink.request).not.toHaveBeenCalled();
    await expect(session.prompt({ text: 'after close' })).rejects.toMatchObject({
      code: 'cancelled',
    });
  });
});

describe('createAcpProviderSessionRuntime: Manual chat plan exit covers one turn (PR #1462 review)', () => {
  /** agy's request to leave plan mode, as a Manual chat sees it (`kind` is optional in ACP). */
  const planExit = (sessionId: unknown, withKind: boolean) => ({
    sessionId,
    toolCall: {
      toolCallId: 'exit-1',
      title: 'Leave plan',
      ...(withKind ? { kind: 'switch_mode' } : {}),
    },
    options: [
      { optionId: 'allow', kind: 'allow_once', name: 'Allow' },
      { optionId: 'reject', kind: 'reject_once', name: 'Reject' },
    ],
  });

  /**
   * Turn 1 asks to leave plan mode (the sink accepts) and, when `report` is
   * set, reports the switch to `default` as agy does; later turns just end.
   */
  function scriptPlanExit(report: boolean, withKind = true) {
    return (agent: FakeAcpAgent): void => {
      agent.handle('session/new', () => ({ result: AGY_SESSION_REPLY }));
      let turns = 0;
      agent.handle('session/prompt', async (prompt, fake) => {
        if (++turns === 1) {
          await fake.request(
            'session/request_permission',
            planExit(prompt['sessionId'], withKind),
          );
          if (report) {
            await fake.sessionUpdate(String(prompt['sessionId']), {
              sessionUpdate: 'current_mode_update',
              currentModeId: 'default',
            });
          }
        }
        // Usage on the reply: no usage-drain wait per turn.
        return {
          result: { stopReason: 'end_turn', _meta: { usage: { inputTokens: 1, outputTokens: 1 } } },
        };
      });
    };
  }

  /** The `session/set_mode` and `session/prompt` requests the agent received, in order. */
  const modeAndPrompts = (agent: FakeAcpAgent): string[] =>
    agent.received
      .filter((m) => m.method === 'session/set_mode' || m.method === 'session/prompt')
      .map((m) =>
        m.method === 'session/set_mode' ? `set_mode:${String(params(m)['modeId'])}` : 'prompt',
      );

  const accepting = (): ProviderApprovalSink => ({
    request: jest.fn(async () => 'accept' as const),
  });

  it.each([
    ['agy reports the switch (current_mode_update)', true, true],
    ['agy does not report the switch', false, true],
    ['the approval has no kind and agy does not report the switch', false, false],
  ])(
    'turn 2 starts in plan mode after a plan exit approved in turn 1: %s',
    async (_label, report, withKind) => {
      const { agent, open } = harness({}, scriptPlanExit(report, withKind));
      const sink = accepting();
      const session = await open({ approvals: sink });

      const first = await untilTerminal(session, () => session.prompt({ text: 'plan it' }));
      expect(first.at(-1)).toMatchObject({ type: 'terminal', status: 'completed' });
      if (withKind) {
        // The card says plainly what approving allows.
        expect(sink.request).toHaveBeenCalledWith(
          expect.objectContaining({ kind: 'switch_mode', title: ANTIGRAVITY_PLAN_EXIT_TITLE }),
          expect.anything(),
        );
      }
      const second = await untilTerminal(session, () => session.prompt({ text: 'next' }));
      expect(second.at(-1)).toMatchObject({ type: 'terminal', status: 'completed' });

      // Open sets plan; every prompt re-enters plan first, whatever happened before.
      expect(modeAndPrompts(agent)).toEqual([
        'set_mode:plan',
        'set_mode:plan',
        'prompt',
        'set_mode:plan',
        'prompt',
      ]);
      await session.close();
    },
  );

  it('sets plan mode before every Manual prompt even when no approval happened', async () => {
    const { agent, open } = harness({}, (fake) => {
      fake.handle('session/new', () => ({ result: AGY_SESSION_REPLY }));
      fake.handle('session/prompt', () => ({
        result: { stopReason: 'end_turn', _meta: { usage: { inputTokens: 1, outputTokens: 1 } } },
      }));
    });
    const session = await open({ approvals: accepting() });
    for (const text of ['one', 'two', 'three']) {
      await untilTerminal(session, () => session.prompt({ text }));
    }
    expect(modeAndPrompts(agent)).toEqual([
      'set_mode:plan',
      'set_mode:plan',
      'prompt',
      'set_mode:plan',
      'prompt',
      'set_mode:plan',
      'prompt',
    ]);
    await session.close();
  });

  it('does not send the prompt when agy refuses to go back to plan mode', async () => {
    const { agent, open } = harness({}, scriptPlanExit(true));
    const session = await open({ approvals: accepting() });
    await untilTerminal(session, () => session.prompt({ text: 'plan it' }));
    agent.handle('session/set_mode', () => ({
      error: { code: -32603, message: 'mode switch failed' },
    }));

    const events = await untilTerminal(session, () => session.prompt({ text: 'next' }));
    expect(sent(agent, 'session/prompt')).toHaveLength(1);
    const error = events.find((event) => event.type === 'error');
    expect(error).toMatchObject({ error: { code: 'request-failed' } });
    expect(error?.type === 'error' ? error.error.message : '').toMatch(
      /could not switch back to the "plan" mode.*not sent/,
    );
    expect(events.at(-1)).toMatchObject({
      type: 'terminal',
      status: 'failed',
      disposition: 'reusable',
    });

    // The session stays usable: once the switch works, the next prompt goes out in plan.
    agent.handle('session/set_mode', () => ({ result: {} }));
    const retry = await untilTerminal(session, () => session.prompt({ text: 'again' }));
    expect(retry.at(-1)).toMatchObject({ type: 'terminal', status: 'completed' });
    expect(modeAndPrompts(agent).slice(-2)).toEqual(['set_mode:plan', 'prompt']);
    await session.close();
  });

  it.each(['auto-edit', 'yolo', 'plan'] as const)(
    'leaves a %s chat in its mode across turns',
    async (permission) => {
      const { agent, open } = harness({}, scriptPlanExit(true));
      const session = await open({
        approvals: accepting(),
        policy: { permission, cwd: process.cwd() },
      });
      await untilTerminal(session, () => session.prompt({ text: 'one' }));
      await untilTerminal(session, () => session.prompt({ text: 'two' }));
      const steps = modeAndPrompts(agent);
      expect(steps.filter((step) => step !== 'prompt')).toHaveLength(1);
      expect(steps.slice(-2)).toEqual(['prompt', 'prompt']);
      await session.close();
    },
  );

  it('follows a permission change: Manual guards from then on, another permission stops it', async () => {
    const { agent, open } = harness({}, scriptPlanExit(true));
    const session = await open({
      approvals: accepting(),
      policy: { permission: 'auto-edit', cwd: process.cwd() },
    });
    await session.setPermission('ask');
    await untilTerminal(session, () => session.prompt({ text: 'plan it' }));
    await untilTerminal(session, () => session.prompt({ text: 'next' }));
    await session.setPermission('auto-edit');
    await untilTerminal(session, () => session.prompt({ text: 'edit' }));
    expect(modeAndPrompts(agent)).toEqual([
      'set_mode:accept-edits',
      'set_mode:plan',
      'set_mode:plan',
      'prompt',
      'set_mode:plan',
      'prompt',
      'set_mode:accept-edits',
      'prompt',
    ]);
    await session.close();
  });

  it('leaves a CLI lane consumer in its mode across turns', async () => {
    const { agent, open } = harness({}, scriptPlanExit(true));
    const session = await open({ approvals: accepting(), consumer: 'lane' });
    await untilTerminal(session, () => session.prompt({ text: 'one' }));
    await untilTerminal(session, () => session.prompt({ text: 'two' }));
    // A lane's ask is agy's `default`, set once at open.
    expect(modeAndPrompts(agent)).toEqual(['set_mode:default', 'prompt', 'prompt']);
    await session.close();
  });
});
