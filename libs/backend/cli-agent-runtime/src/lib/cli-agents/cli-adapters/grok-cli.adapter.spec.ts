/**
 * GrokCliAdapter — detection, capabilities, the `grok models` parser and
 * probe, the credential check, and `runSdk` end to end against the fake ACP
 * agent. `runSdk` reaches the real lane handle and ACP runtime; only its
 * `transportFactory` seam is redirected to an in-memory transport, so the argv
 * the runtime would spawn is pinned exactly.
 */
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import type { CliOutputSegment } from '@ptah-extension/shared';
import { createMockLogger } from '@ptah-extension/shared/testing';
import type { Logger } from '@ptah-extension/vscode-core';
import type { AcpSpawnOptions } from '@ptah-extension/acp-runtime';
import {
  createFakeAcpAgent,
  type FakeAcpAgent,
  type FakeAcpMessage,
} from '@ptah-extension/acp-runtime/testing';
import type { ProviderSessionLaneHandleConfig } from './provider-session/provider-session-lane-handle';

const mockSpawnCli = jest.fn();
const mockResolveCliPath = jest.fn();
const mockProbeCliVersion = jest.fn();
const mockKillProcessTree = jest.fn();

jest.mock('./cli-adapter.utils', () => {
  const actual = jest.requireActual<typeof import('./cli-adapter.utils')>(
    './cli-adapter.utils',
  );
  return {
    ...actual,
    spawnCli: (...args: unknown[]) => mockSpawnCli(...args),
    resolveCliPath: (...args: unknown[]) => mockResolveCliPath(...args),
    probeCliVersion: (...args: unknown[]) => mockProbeCliVersion(...args),
    killProcessTree: (...args: unknown[]) => mockKillProcessTree(...args),
  };
});

const mockReadFile = jest.fn();
jest.mock('fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));

/** The fake agent `runSdk` connects to, and what the runner was handed. */
let mockFakeAgent: FakeAcpAgent | undefined;
let mockHandleConfig: ProviderSessionLaneHandleConfig | undefined;
let mockSpawnOptions: AcpSpawnOptions | undefined;

jest.mock('./provider-session/provider-session-lane-handle', () => {
  const actual = jest.requireActual<
    typeof import('./provider-session/provider-session-lane-handle')
  >('./provider-session/provider-session-lane-handle');
  const fixtures = jest.requireActual<
    typeof import('@ptah-extension/acp-runtime/testing')
  >('@ptah-extension/acp-runtime/testing');
  return {
    ...actual,
    createProviderSessionLaneHandle: (
      config: ProviderSessionLaneHandleConfig,
    ) => {
      mockHandleConfig = config;
      if (!mockFakeAgent) throw new Error('no fake agent scripted');
      const transport = fixtures.createFakeAcpTransport(mockFakeAgent);
      return actual.createProviderSessionLaneHandle({
        ...config,
        transportFactory: (options) => {
          mockSpawnOptions = options;
          return transport;
        },
      });
    },
  };
});

import { GrokCliAdapter, parseGrokModels } from './grok-cli.adapter';
import { grokAcpProfile } from '@ptah-extension/acp-runtime';
import type { AgentMessagePreview, AgentProcessInfo } from '@ptah-extension/shared';
import type { SdkHandle } from './cli-adapter.interface';
import { blockedLaneCommand } from './lane-command-filter';
import { resolveEffectiveLaneCapabilities } from '../messaging/agent-effective-capabilities';
import { turnInputRefusal } from '../messaging/agent-delivery-planner';
import { resolveCliLanePolicy } from '../cli-lane-policy-resolver';

/** `grok models` as grok 1.0.46 printed it (`grok-probe.md` §6). */
const PROBED_MODELS_OUTPUT = [
  'You are logged in with grok.com.',
  '',
  'Default model: grok-4.7',
  '',
  'Available models:',
  '  * grok-4.7 (default)',
  '',
].join('\n');

/** The config options Grok advertised on `session/new` (grok-p3-set-model-unknown). */
const GROK_CONFIG_OPTIONS = [
  {
    id: 'model',
    name: 'Model',
    category: 'model',
    type: 'select',
    currentValue: 'grok-4.7',
    options: [{ value: 'grok-4.7', name: 'Grok 4.7' }],
  },
  {
    id: 'reasoning_effort',
    name: 'Reasoning Effort',
    category: 'thought_level',
    type: 'select',
    currentValue: 'medium',
    options: [
      { value: 'xhigh', name: 'Extra High' },
      { value: 'high', name: 'High' },
      { value: 'medium', name: 'Medium' },
      { value: 'low', name: 'Low' },
    ],
  },
];

interface FakeProbeChild extends EventEmitter {
  stdout: PassThrough;
  kill: jest.Mock;
  pid: number;
  killed: boolean;
  whenSpawned: Promise<number | null>;
}

function createProbeChild(): FakeProbeChild {
  const child = new EventEmitter() as FakeProbeChild;
  child.stdout = new PassThrough();
  child.kill = jest.fn();
  child.pid = 8675;
  child.killed = false;
  child.whenSpawned = Promise.resolve(child.pid);
  return child;
}

const flush = (): Promise<void> => Promise.resolve();

describe('GrokCliAdapter', () => {
  let adapter: GrokCliAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFakeAgent = undefined;
    mockHandleConfig = undefined;
    mockSpawnOptions = undefined;
    adapter = new GrokCliAdapter();
  });

  afterEach(async () => {
    jest.useRealTimers();
    await mockFakeAgent?.close();
  });

  describe('identity and capabilities', () => {
    it('is the grok lane with MCP, continuation and interrupt but no steer', () => {
      expect(adapter.name).toBe('grok');
      expect(adapter.displayName).toBe('Grok');
      expect(adapter.roleChannel).toBe('task-prompt');
      expect(adapter.supportsMcp).toBe(true);
      expect(adapter.capabilities().messaging.continuation.state).toBe('supported');
      expect(adapter.capabilities().messaging.interrupt.state).toBe('supported');
      expect(adapter.capabilities().messaging.steer.state).toBe('unsupported');
      expect(adapter.capabilities().permissionModes.plan?.state).toBe('unsupported');
    });

    it('defaults a lane with no explicit mode to its only verified mode, yolo with network', () => {
      expect(resolveCliLanePolicy({ cli: 'grok', manifest: adapter.capabilities(), saved: {}, request: {} }))
        .toMatchObject({ permission: 'yolo', network: 'allow',
          permissionSource: 'built-in', networkSource: 'built-in' });
    });

    it('strips ANSI codes from raw output', () => {
      expect(adapter.parseOutput('\u001b[32mok\u001b[0m')).toBe('ok');
    });
  });

  describe('lane turn input (B8, D18)', () => {
    const info = { agentId: 'grok-lane', cli: 'grok', displayName: 'Grok' } as unknown as AgentProcessInfo;
    const liveHandle = {
      abort: new AbortController(),
      done: Promise.resolve(0),
      onOutput: () => undefined,
      applyTurnSettings: async () => ({ appliesAt: 'next-turn' as const }),
      listTurnOptions: async () => ({ models: [], efforts: [], commands: [] }),
      turnInputSupport: () => ({}),
    } as SdkHandle;

    it('declares the ACP turn input, turn-end usage and no lane prompts', () => {
      const manifest = adapter.capabilities();
      expect(manifest.turnInput).toEqual({
        model: { state: 'supported', appliesAt: 'next-turn' },
        effort: { state: 'supported', appliesAt: 'next-turn' },
        images: { state: 'supported', onSteer: false },
        files: { state: 'supported', delivery: 'reference' },
        commands: { state: 'supported', blocked: ['always-approve'] },
        skills: { state: 'supported' },
      });
      expect(manifest.turnInput?.commands.blocked).toEqual(grokAcpProfile.hiddenLaneCommands);
      expect(manifest.usage).toEqual({ timing: 'turn-end', reason: 'Grok reports token usage when the turn ends.' });
      expect(manifest.prompts?.approvals).toEqual({
        state: 'unsupported',
        reason: 'Grok exposes no native per-lane ask flag.',
      });
    });

    it.each(['/always-approve on', '  /always-approve', '\n/Always-Approve off', '/ALWAYS-APPROVE'])(
      'refuses %j on live and restored Grok lanes',
      (text) => {
        const manifest = adapter.capabilities();
        for (const caps of [
          resolveEffectiveLaneCapabilities(info, manifest, liveHandle),
          resolveEffectiveLaneCapabilities(info, manifest),
        ]) {
          expect(caps.turnInput?.commands.blocked).toEqual(['always-approve']);
          expect(blockedLaneCommand(text, caps.turnInput?.commands.blocked ?? [])).toBe('always-approve');
          const plan = { mode: 'queue-next-turn', usesResume: caps.source === 'restored-record', effectiveCapabilities: caps } as unknown as AgentMessagePreview;
          expect(turnInputRefusal(plan, text, undefined)).toEqual({
            code: 'turn-input-unsupported',
            reason: 'Ptah does not allow /always-approve in a lane: its approval mode is set at spawn.',
          });
        }
      },
    );

    it('does not refuse ordinary text or a longer command name', () => {
      const blocked = adapter.capabilities().turnInput?.commands.blocked ?? [];
      expect(blockedLaneCommand('please /always-approve', blocked)).toBeUndefined();
      expect(blockedLaneCommand('/always-approved', blocked)).toBeUndefined();
      expect(blockedLaneCommand('/compact', blocked)).toBeUndefined();
    });
  });

  describe('detect()', () => {
    it('reports the resolved binary and version, with the interrupt messaging mode', async () => {
      mockResolveCliPath.mockResolvedValue('C:\\bin\\grok.exe');
      mockProbeCliVersion.mockResolvedValue('grok 1.0.46');

      await expect(adapter.detect()).resolves.toEqual({
        cli: 'grok',
        installed: true,
        path: 'C:\\bin\\grok.exe',
        version: 'grok 1.0.46',
        messagingMode: 'interrupt',
      });
      expect(mockResolveCliPath).toHaveBeenCalledWith('grok');
    });

    it('reports not installed when the binary is not on PATH', async () => {
      mockResolveCliPath.mockResolvedValue(null);
      await expect(adapter.detect()).resolves.toEqual({
        cli: 'grok',
        installed: false,
        messagingMode: 'interrupt',
      });
    });

    it('reports not installed when detection throws', async () => {
      mockResolveCliPath.mockRejectedValue(new Error('where failed'));
      await expect(adapter.detect()).resolves.toMatchObject({
        cli: 'grok',
        installed: false,
      });
    });
  });

  describe('parseGrokModels()', () => {
    it('parses the probed output', () => {
      expect(parseGrokModels(PROBED_MODELS_OUTPUT)).toEqual([
        { id: 'grok-4.7', name: 'grok-4.7' },
      ]);
    });

    it('parses several rows with and without a marker, in order', () => {
      const raw = [
        'Default model: grok-4.7',
        'Available models:',
        '  * grok-4.7 (default)',
        '    grok-4.7-mini',
        '  - grok-code-fast',
        'Run `grok models --help` for more.',
        '  ignored-after-the-list',
      ].join('\r\n');
      expect(parseGrokModels(raw).map((m) => m.id)).toEqual([
        'grok-4.7',
        'grok-4.7-mini',
        'grok-code-fast',
      ]);
    });

    it('takes the first token of a row with trailing description text', () => {
      const raw = [
        'Available models:',
        '  * grok-4.7 - frontier model (default)',
        '    grok-code-fast   fast coding model',
      ].join('\n');
      expect(parseGrokModels(raw).map((m) => m.id)).toEqual([
        'grok-4.7',
        'grok-code-fast',
      ]);
    });

    it('rejects indented footer and prose lines inside the list', () => {
      const raw = [
        'Available models:',
        '  * grok-4.7 (default)',
        '  Run grok models --help for details',
        '  Use --model <id> to pick one.',
        '  Note: more models need a paid plan',
        '  Default',
        '  models',
        '  see https://x.ai/models',
      ].join('\n');
      expect(parseGrokModels(raw).map((m) => m.id)).toEqual(['grok-4.7']);
    });

    it('rejects a bare prose word even when it ends the line', () => {
      const raw = ['Available models:', '    grok-code-fast', '    Done'].join(
        '\n',
      );
      expect(parseGrokModels(raw).map((m) => m.id)).toEqual(['grok-code-fast']);
    });

    it('falls back to the default model when no rows are listed', () => {
      expect(parseGrokModels('Default model: grok-4.7\n')).toEqual([
        { id: 'grok-4.7', name: 'grok-4.7' },
      ]);
    });

    it('returns an empty list for unrecognised output', () => {
      expect(parseGrokModels('')).toEqual([]);
      expect(parseGrokModels('error: not logged in\n')).toEqual([]);
      expect(
        parseGrokModels('Available models:\n  (none: sign in first)\n'),
      ).toEqual([]);
    });
  });

  describe('listModels()', () => {
    it('runs `grok models` on the resolved binary and parses stdout', async () => {
      mockResolveCliPath.mockResolvedValue('C:\\bin\\grok.exe');
      const child = createProbeChild();
      mockSpawnCli.mockReturnValue(child);

      const models = adapter.listModels();
      await flush();
      await flush();
      child.stdout.write(PROBED_MODELS_OUTPUT);
      await flush();
      child.emit('close', 0);

      await expect(models).resolves.toEqual([
        { id: 'grok-4.7', name: 'grok-4.7' },
      ]);
      const [binary, args] = mockSpawnCli.mock.calls[0] as [string, string[]];
      expect(binary).toBe('C:\\bin\\grok.exe');
      expect(args).toEqual(['models']);
    });

    it('returns an empty list when the probe errors', async () => {
      mockResolveCliPath.mockResolvedValue(null);
      const child = createProbeChild();
      mockSpawnCli.mockReturnValue(child);

      const models = adapter.listModels();
      await flush();
      await flush();
      child.emit('error', new Error('ENOENT'));

      await expect(models).resolves.toEqual([]);
      expect(mockSpawnCli.mock.calls[0][0]).toBe('grok');
    });

    it('returns an empty list when spawning throws', async () => {
      mockResolveCliPath.mockResolvedValue('grok');
      mockSpawnCli.mockImplementation(() => {
        throw new Error('command line too long');
      });
      await expect(adapter.listModels()).resolves.toEqual([]);
    });

    it('kills the probe process tree and returns an empty list after 8 s', async () => {
      jest.useFakeTimers();
      mockResolveCliPath.mockResolvedValue('grok');
      const child = createProbeChild();
      mockSpawnCli.mockReturnValue(child);

      const models = adapter.listModels();
      await flush();
      await flush();
      jest.advanceTimersByTime(7999);
      expect(child.kill).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);

      await expect(models).resolves.toEqual([]);
      await flush();
      expect(child.kill).not.toHaveBeenCalled();
      expect(mockKillProcessTree).toHaveBeenCalledTimes(1);
      expect(mockKillProcessTree).toHaveBeenCalledWith(child.pid);
    });
  });

  describe('ensureTokensFresh()', () => {
    let savedKey: string | undefined;
    beforeEach(() => {
      savedKey = process.env['XAI_API_KEY'];
      delete process.env['XAI_API_KEY'];
    });
    afterEach(() => {
      if (savedKey === undefined) delete process.env['XAI_API_KEY'];
      else process.env['XAI_API_KEY'] = savedKey;
    });

    it('is true when ~/.grok/auth.json exists and parses', async () => {
      mockReadFile.mockResolvedValue('{"provider":"grok.com"}');
      await expect(adapter.ensureTokensFresh()).resolves.toBe(true);
      const [path] = mockReadFile.mock.calls[0] as [string];
      expect(path.replace(/\\/g, '/')).toMatch(/\/\.grok\/auth\.json$/);
    });

    it('ignores XAI_API_KEY: false when auth.json is missing', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));
      process.env['XAI_API_KEY'] = 'xai-test';
      await expect(adapter.ensureTokensFresh()).resolves.toBe(false);
    });

    it('is false with a malformed auth.json', async () => {
      mockReadFile.mockResolvedValue('{not json');
      await expect(adapter.ensureTokensFresh()).resolves.toBe(false);
    });

    it.each(['{}', '[]', '["grok.com"]', 'null', '"token"'])(
      'is false when auth.json parses to %s (not a non-empty object)',
      async (content) => {
        mockReadFile.mockResolvedValue(content);
        await expect(adapter.ensureTokensFresh()).resolves.toBe(false);
      },
    );

    it('is false with no login at all', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT'));
      await expect(adapter.ensureTokensFresh()).resolves.toBe(false);
    });
  });

  describe('runSdk() against the fake ACP agent', () => {
    const byMethod =
      (method: string) =>
      (m: FakeAcpMessage): boolean =>
        m.method === method;
    const paramsOf = (m: FakeAcpMessage | undefined): Record<string, unknown> =>
      (m?.params ?? {}) as Record<string, unknown>;

    it('spawns `grok agent --no-leader stdio` with no model, effort or approval flags', async () => {
      mockFakeAgent = createFakeAcpAgent({ sessionId: 'grok-sess-1' });
      const handle = await adapter.runSdk({
        task: 'Summarise the repository',
        workingDirectory: process.cwd(),
        binaryPath: 'C:\\bin\\grok.exe',
        model: 'grok-4.7',
        reasoningEffort: 'high',
        autoApprove: true,
        resumeSessionId: undefined,
      });
      await expect(handle.done).resolves.toBe(0);

      const args = mockSpawnOptions?.args ?? [];
      expect(mockSpawnOptions?.command).toBe('C:\\bin\\grok.exe');
      expect(args).toEqual(['agent', '--no-leader', 'stdio']);
      expect(args).toContain('--no-leader');
      expect(args[args.length - 1]).toBe('stdio');
      expect(args).not.toContain('--leader');
      expect(args).not.toContain('--always-approve');
      expect(args).not.toContain('-m');
      expect(args).not.toContain('--reasoning-effort');
      // The lane base environment (host + clean-output variables), no Grok extras.
      expect(mockSpawnOptions?.env).toMatchObject({ NO_COLOR: '1', FORCE_COLOR: '0' });
      expect(mockSpawnOptions?.needsConsole).toBe(false);
      handle.abort.abort();
    });

    it('falls back to the bare `grok` command and forwards spawner and logger', async () => {
      mockFakeAgent = createFakeAcpAgent();
      const spawner = { spawn: jest.fn() };
      const logger = createMockLogger() as unknown as Logger;
      const withDeps = new GrokCliAdapter(
        spawner as unknown as ConstructorParameters<typeof GrokCliAdapter>[0],
        logger,
      );
      const handle = await withDeps.runSdk({
        task: 't',
        workingDirectory: process.cwd(),
      });
      await handle.done;

      expect(mockSpawnOptions?.command).toBe('grok');
      expect(mockHandleConfig?.spawner).toBe(spawner);
      expect(mockHandleConfig?.logger).toBe(logger);
      expect(mockHandleConfig?.profile.vendor).toBe('grok');
      handle.abort.abort();
    });

    it('runs a full turn: Ptah MCP on session/new, model and effort config, prompt, x.ai notices ignored', async () => {
      mockFakeAgent = createFakeAcpAgent({
        sessionId: 'grok-sess-2',
        configOptions: GROK_CONFIG_OPTIONS,
      });
      mockFakeAgent.handle('session/prompt', async (params, agent) => {
        const id = String(params['sessionId']);
        await agent.notify('_x.ai/session_notification', {
          sessionId: id,
          kind: 'retry_state',
        });
        await agent.sessionUpdate(id, {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'Hello from Grok' },
        });
        return { result: { stopReason: 'end_turn', _meta: { usage: { inputTokens: 44, outputTokens: 7, cacheReadTokens: 5, model: 'grok-4.7' } } } };
      });

      const handle = await adapter.runSdk({
        task: 'Summarise the repository',
        workingDirectory: process.cwd(),
        mcpPort: 51820,
        mcpToken: 'lane-token',
        agentId: 'agent-9',
        model: 'grok-4.7',
        // Already mapped by the lane spawn policy (`max` → `xhigh`).
        reasoningEffort: 'xhigh',
      });
      const segments: CliOutputSegment[] = [];
      const output: string[] = [];
      handle.onSegment?.((s) => segments.push(s));
      handle.onOutput((d) => output.push(d));

      await expect(handle.done).resolves.toBe(0);

      const received = mockFakeAgent.received;
      const created = paramsOf(received.find(byMethod('session/new')));
      expect(created['mcpServers']).toEqual([
        {
          type: 'http',
          name: 'ptah',
          url: `http://localhost:51820/agent/agent-9/workspace/${encodeURIComponent(process.cwd())}`,
          headers: [{ name: 'Authorization', value: 'Bearer lane-token' }],
        },
      ]);
      const config = received
        .filter(byMethod('session/set_config_option'))
        .map((m) => paramsOf(m));
      expect(config).toEqual([
        { sessionId: 'grok-sess-2', configId: 'model', value: 'grok-4.7' },
        {
          sessionId: 'grok-sess-2',
          configId: 'reasoning_effort',
          value: 'xhigh',
        },
      ]);
      expect(received.filter(byMethod('session/prompt'))).toHaveLength(1);
      expect(
        JSON.stringify(
          paramsOf(received.find(byMethod('session/prompt'))),
        ).match(/Lane policy id: ptah-lane-policy-v1/g),
      ).toHaveLength(1);
      expect(handle.getSessionId?.()).toBe('grok-sess-2');
      expect(handle.supportsContinuation?.()).toBe(true);
      expect(output.join('')).toContain('Hello from Grok');
      expect(segments.filter((s) => s.type === 'error')).toEqual([]);
      expect(segments.find((s) => s.turnTelemetry)?.turnTelemetry).toMatchObject({
        status: 'reported', usage: { modelId: 'grok-4.7', inputTokens: 44, outputTokens: 7, cacheReadTokens: { status: 'reported', value: 5 } },
      });
      expect(
        segments.filter((s) => s.type === 'info' && s.content.includes('x.ai')),
      ).toEqual([]);
      handle.abort.abort();
    });

    it('fails the first turn with the Grok model wording when the model is refused', async () => {
      mockFakeAgent = createFakeAcpAgent({
        configOptions: GROK_CONFIG_OPTIONS,
      });
      mockFakeAgent.handle('session/set_config_option', () => ({
        error: {
          code: -32602,
          message: 'Invalid params',
          data: 'unknown model id',
        },
      }));

      const handle = await adapter.runSdk({
        task: 't',
        workingDirectory: process.cwd(),
        model: 'nonexistent-model',
        modelSource: 'setting',
      });
      const segments: CliOutputSegment[] = [];
      handle.onSegment?.((s) => segments.push(s));

      await expect(handle.done).resolves.toBe(1);
      expect(segments.filter((s) => s.type === 'error')).toEqual([
        {
          type: 'error',
          content:
            "Grok rejected model 'nonexistent-model' (from the `agentOrchestration.grokModel` setting); available models: grok-4.7",
        },
      ]);
      expect(mockFakeAgent.received.filter(byMethod('session/prompt'))).toEqual(
        [],
      );
    });
  });
});
