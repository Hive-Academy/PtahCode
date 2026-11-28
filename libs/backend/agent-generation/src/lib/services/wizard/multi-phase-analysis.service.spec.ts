/**
 * MultiPhaseAnalysisService Tests
 *
 * Drives the analysis pipeline with fake SDK streams against the real
 * `AnalysisStorageService` over an in-memory file system, so every assertion
 * about the manifest is an assertion about what is on disk.
 *
 * Covers:
 * - success with an agent-written file
 * - success where the file is created from the complete captured text
 * - no result / error result / timeout => failed with an error, diagnostic
 *   text kept, never `completed`
 * - user pause => `paused`, active phase back to `pending`, slug kept
 * - resume skips completed phases, restarts a stale `running` phase, keeps
 *   the runId, never deletes
 * - a phase file left by an earlier run never satisfies the resumed phase:
 *   fresh text replaces it, and no text at all fails the phase
 * - resume without a resumable manifest falls back to a fresh run
 * - text capture ignores the throttled UI emitter
 */

import 'reflect-metadata';
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import { join, resolve } from 'path';
import { createHash } from 'crypto';

jest.mock('@ptah-extension/vscode-core', () => ({
  Logger: class {},
  TOKENS: {
    LOGGER: Symbol.for('Logger'),
    WEBVIEW_MANAGER: Symbol.for('WebviewManager'),
  },
}));

jest.mock('@ptah-extension/settings-core', () => ({
  SETTINGS_TOKENS: { MODEL_SETTINGS: Symbol.for('ModelSettings') },
}));

jest.mock('@ptah-extension/agent-sdk', () => ({
  SDK_TOKENS: {
    SDK_INTERNAL_QUERY_SERVICE: Symbol.for('InternalQueryService'),
  },
  // Drains the stream like the real processor and emits a throttled UI text
  // delta that MUST NOT reach any persisted phase file.
  SdkStreamProcessor: class {
    constructor(
      private readonly config: {
        emitter: { emit: (event: unknown) => void };
      },
    ) {}
    async process(stream: AsyncIterable<unknown>): Promise<unknown> {
      this.config.emitter.emit({
        kind: 'text',
        content: 'UI-ONLY-DELTA',
        timestamp: Date.now(),
      });
      for await (const _message of stream) {
        /* drain */
      }
      return { structuredOutput: null };
    }
  },
  discoverPluginSkills: jest.fn(() => []),
  formatSkillsForPrompt: jest.fn(() => ''),
  isSystemInit: (message: SdkMessage) =>
    message['type'] === 'system' && message['subtype'] === 'init',
}));

import {
  createMockFileSystemProvider,
  type MockFileSystemProvider,
} from '@ptah-extension/platform-core/testing';
import type { IWorkspaceLlmResolver } from '@ptah-extension/agent-sdk';
import { AnalysisStorageService } from '../analysis-storage.service';
import { AnalysisClaudeMdLinker } from '../analysis-claude-md-linker';
import { computeWorkspaceFingerprint } from '../analysis-fingerprint';
import { buildPhase1Prompts } from './multi-phase-prompts';
import {
  MultiPhaseAnalysisService,
  PER_PHASE_TIMEOUT_MS,
  PHASE_MAX_AGENT_TURNS,
  DEFAULT_MAX_AGENT_TURNS,
  SUBSTANTIAL_PHASE_FILE_MIN_BYTES,
} from './multi-phase-analysis.service';
import {
  PHASE_CONFIGS,
  type MultiPhaseManifest,
  type MultiPhaseManifestV3,
  type MultiPhaseManifestV4,
} from '../../types/multi-phase.types';

const WORKSPACE = resolve('/ws/demo');
const SLUG_DIR = join(WORKSPACE, '.ptah', 'analysis', 'demo');
const FILES = PHASE_CONFIGS.map((c) => c.file);

type SdkMessage = Record<string, unknown>;
type Scenario = (signal: AbortSignal) => AsyncIterable<SdkMessage>;

const assistant = (text: string): SdkMessage => ({
  type: 'assistant',
  session_id: 'sdk-session-default',
  message: { content: [{ type: 'text', text }] },
});
const success = (result?: string): SdkMessage => ({
  type: 'result',
  session_id: 'sdk-session-default',
  subtype: 'success',
  result,
  num_turns: 1,
  total_cost_usd: 0,
  usage: { input_tokens: 0, output_tokens: 0 },
});
const errorResult = (): SdkMessage => ({
  type: 'result',
  session_id: 'sdk-session-default',
  subtype: 'error_during_execution',
  errors: ['model exploded'],
});
const maxTurnsResult = (): SdkMessage => ({
  type: 'result',
  session_id: 'sdk-session-default',
  subtype: 'error_max_turns',
  errors: ['maximum turns exceeded'],
});

function abortError(reason: unknown): Error {
  const error = new Error(`aborted: ${String(reason)}`);
  error.name = 'AbortError';
  return error;
}

/** Yields the given messages, running `sideEffect` before the result. */
function streamOf(
  messages: SdkMessage[],
  sideEffect?: () => Promise<void> | void,
): Scenario {
  return async function* () {
    for (const message of messages) {
      if (message['type'] === 'result' && sideEffect) await sideEffect();
      yield message;
    }
  };
}

/** Yields partial text, then hangs until the phase signal aborts. */
function hangingStream(afterPartial?: () => void): Scenario {
  return async function* (signal: AbortSignal) {
    yield assistant('partial output');
    afterPartial?.();
    await new Promise<never>((_, reject) => {
      if (signal.aborted) {
        reject(abortError(signal.reason));
        return;
      }
      signal.addEventListener(
        'abort',
        () => reject(abortError(signal.reason)),
        {
          once: true,
        },
      );
    });
  };
}

describe('MultiPhaseAnalysisService', () => {
  let fs: MockFileSystemProvider;
  let storage: AnalysisStorageService;
  let service: MultiPhaseAnalysisService;
  let scenarios: Scenario[];
  let execute: jest.Mock<
    (config: {
      abortController: AbortController;
      maxTurns?: number;
    }) => Promise<{
      stream: AsyncIterable<SdkMessage>;
      close: () => void;
      abort: () => void;
    }>
  >;
  let closeFn: jest.Mock;
  let broadcastMessage: jest.Mock;
  let resolveLlm: jest.Mock<IWorkspaceLlmResolver['resolveForPath']>;
  let resolveSetup: jest.Mock<IWorkspaceLlmResolver['resolveSetup']>;
  const SNAPSHOT_AUTH = { env: { ANTHROPIC_AUTH_TOKEN: 'ws-key' } };
  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  /** Scenario whose agent writes the expected phase file itself. */
  const agentWritesFile = (file: string, text = 'agent wrote'): Scenario =>
    streamOf([assistant(text), success(text)], () =>
      storage.writePhaseFile(SLUG_DIR, file, `# ${file}\n${text}`),
    );

  async function readManifest(): Promise<MultiPhaseManifest> {
    return JSON.parse(
      await fs.readFile(join(SLUG_DIR, 'manifest.json')),
    ) as MultiPhaseManifest;
  }

  function manifestWrites(): MultiPhaseManifest[] {
    return fs.writeFile.mock.calls
      .filter(([path]) => String(path).endsWith('manifest.json'))
      .map(([, content]) => JSON.parse(String(content)) as MultiPhaseManifest);
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    fs = createMockFileSystemProvider();
    await fs.createDirectory(WORKSPACE);
    storage = new AnalysisStorageService(logger as never, fs);
    scenarios = [];
    closeFn = jest.fn();
    execute = jest.fn(
      async (config: {
        abortController: AbortController;
        maxTurns?: number;
      }) => {
        const scenario = scenarios.shift();
        if (!scenario) throw new Error('No scenario left for execute()');
        return {
          stream: scenario(config.abortController.signal),
          close: closeFn,
          abort: jest.fn(),
        };
      },
    );
    broadcastMessage = jest.fn();
    resolveLlm = jest.fn<IWorkspaceLlmResolver['resolveForPath']>(async () => ({
      providerId: 'kimi-code',
      model: 'snapshot-model',
      auth: SNAPSHOT_AUTH,
    }));
    resolveSetup = jest.fn<IWorkspaceLlmResolver['resolveSetup']>(async () => ({
      kind: 'set',
      snapshot: {
        providerId: 'kimi-code',
        model: 'snapshot-model',
        auth: SNAPSHOT_AUTH,
      },
    }));
    service = new MultiPhaseAnalysisService(
      logger as never,
      { broadcastMessage } as never,
      { execute } as never,
      storage,
      {
        resolveForPath: resolveLlm,
        resolveSetup,
      } as never,
      fs,
      new AnalysisClaudeMdLinker(storage, fs, logger as never),
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('requires the MCP server', async () => {
    const result = await service.analyzeWorkspace(WORKSPACE, {
      mcpServerRunning: false,
    });
    expect(result.isErr()).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });

  it('completes every phase whose agent wrote its file and checkpoints each transition', async () => {
    scenarios = FILES.map((file) => agentWritesFile(file));

    const result = await service.analyzeWorkspace(WORKSPACE, {
      mcpServerRunning: true,
    });

    expect(result.isOk()).toBe(true);
    const manifest = result.value!;
    expect(manifest.version).toBe(4);
    expect(manifest.runId).toHaveLength(26);
    expect(manifest.lifecycle).toBe('completed');
    if (manifest.version === 4) {
      expect(manifest.analysisPair).toEqual({
        provider: 'kimi-code',
        model: 'snapshot-model',
      });
    }
    for (const config of PHASE_CONFIGS) {
      expect(manifest.phases[config.id].status).toBe('completed');
      if (manifest.version === 4) {
        const phase = manifest.phases[config.id];
        const bytes = await fs.readFileBytes(join(SLUG_DIR, config.file));
        expect(phase.attempt).toBe(1);
        expect(phase.sessionId).toBe('sdk-session-default');
        expect(phase.input?.workspaceSha256).toBe(
          manifest.workspaceFingerprint.digest,
        );
        expect(phase.input?.promptSha256).toMatch(/^[0-9a-f]{64}$/);
        expect(phase.input?.provider).toBe('kimi-code');
        expect(phase.input?.model).toBe('snapshot-model');
        expect(phase.verification.status).toBe('verified');
        expect(phase.verification.outputSha256).toBe(
          createHash('sha256').update(bytes).digest('hex'),
        );
      }
    }
    const rawManifest = await fs.readFile(join(SLUG_DIR, 'manifest.json'));
    expect(rawManifest).not.toContain('ws-key');
    expect(rawManifest).not.toContain('setupSnapshot');
    expect(rawManifest).not.toContain('"auth"');
    expect(await readManifest()).toEqual(manifest);
    expect(closeFn).toHaveBeenCalledTimes(4);

    const writes = manifestWrites();
    // before phase 1, running + terminal per phase, and the final finish
    expect(writes.length).toBeGreaterThanOrEqual(1 + 2 * 4 + 1);
    expect(
      Object.values(writes[0].phases).every((p) => p.status === 'pending'),
    ).toBe(true);
    expect(writes[0].lifecycle).toBe('running');
    expect(writes[1].phases['project-profile'].status).toBe('running');
  });

  it('creates the phase file from the complete captured text when the agent did not write it', async () => {
    scenarios = [
      streamOf([
        assistant('First turn'),
        assistant('Second turn'),
        success('Second turn'),
      ]),
      ...FILES.slice(1).map((file) => agentWritesFile(file)),
    ];

    const result = await service.analyzeWorkspace(WORKSPACE, {
      mcpServerRunning: true,
    });

    expect(result.value!.phases['project-profile'].status).toBe('completed');
    const file = await fs.readFile(join(SLUG_DIR, FILES[0]));
    expect(file).toBe('First turn\n\nSecond turn');
    expect(file).not.toContain('UI-ONLY-DELTA');
  });

  it('records the SDK init identity rather than the synthetic UI phase identity', async () => {
    scenarios = [
      streamOf([
        { type: 'system', subtype: 'init', session_id: 'sdk-init-one' },
        { ...assistant('profile'), session_id: 'sdk-init-one' },
        { ...success('profile'), session_id: 'sdk-init-one' },
      ]),
      ...FILES.slice(1).map((file) => agentWritesFile(file)),
    ];
    const result = await service.analyzeWorkspace(WORKSPACE, {
      mcpServerRunning: true,
    });
    expect(result.value!.phases['project-profile']).toMatchObject({
      status: 'completed',
      sessionId: 'sdk-init-one',
    });
    expect(
      (result.value as MultiPhaseManifestV4).phases['project-profile']
        .sessionId,
    ).not.toBe('wizard-project-profile');
    expect(
      broadcastMessage.mock.calls.some(([, payload]) => {
        const stream = payload as { flatEvent?: { sessionId?: string } };
        return stream.flatEvent?.sessionId === 'wizard-project-profile';
      }),
    ).toBe(true);
  });

  it('uses the first message identity when the stream has no init', async () => {
    scenarios = [
      streamOf([
        { ...assistant('profile'), session_id: 'first-message-id' },
        { ...success('profile'), session_id: 'later-message-id' },
      ]),
      ...FILES.slice(1).map((file) => agentWritesFile(file)),
    ];
    const result = await service.analyzeWorkspace(WORKSPACE, {
      mcpServerRunning: true,
    });
    expect(
      (result.value as MultiPhaseManifestV4).phases['project-profile']
        .sessionId,
    ).toBe('first-message-id');
  });

  it('fails an attempt when init disagrees with an earlier identity', async () => {
    scenarios = [
      streamOf([
        { ...assistant('profile'), session_id: 'earlier-id' },
        { type: 'system', subtype: 'init', session_id: 'different-id' },
        success('profile'),
      ]),
      ...FILES.slice(1).map((file) => agentWritesFile(file)),
    ];
    const result = await service.analyzeWorkspace(WORKSPACE, {
      mcpServerRunning: true,
    });
    const phase = (result.value as MultiPhaseManifestV4).phases[
      'project-profile'
    ];
    expect(phase.status).toBe('failed');
    expect(phase.error).toContain('system/init session_id disagrees');
    expect(phase.verification.status).toBe('failed');
  });

  it('fails and leaves an attempt unverified when the SDK stream has no identity', async () => {
    scenarios = [
      streamOf([
        { ...assistant('profile'), session_id: undefined },
        { ...success('profile'), session_id: undefined },
      ]),
      ...FILES.slice(1).map((file) => agentWritesFile(file)),
    ];
    const result = await service.analyzeWorkspace(WORKSPACE, {
      mcpServerRunning: true,
    });
    const phase = (result.value as MultiPhaseManifestV4).phases[
      'project-profile'
    ];
    expect(phase.status).toBe('failed');
    expect(phase.error).toBe('Phase finished without an SDK session id');
    expect(phase.sessionId).toBeNull();
    expect(phase.verification.outputSha256).toBeNull();
  });

  it('marks a phase failed when the stream ends without a result, keeping the text for diagnosis', async () => {
    scenarios = [
      streamOf([assistant('diagnostic text')]),
      ...FILES.slice(1).map((file) => agentWritesFile(file)),
    ];

    const result = await service.analyzeWorkspace(WORKSPACE, {
      mcpServerRunning: true,
    });

    const phase = result.value!.phases['project-profile'];
    expect(phase.status).toBe('failed');
    expect(phase.error).toBe('Stream ended without a result');
    expect(await fs.readFile(join(SLUG_DIR, FILES[0]))).toBe('diagnostic text');
    expect(result.value!.lifecycle).toBe('failed');
    expect((await readManifest()).phases['project-profile'].status).toBe(
      'failed',
    );
  });

  it('marks a phase failed on an error result even when a file exists', async () => {
    scenarios = [
      streamOf([assistant('some text'), errorResult()], () =>
        storage.writePhaseFile(SLUG_DIR, FILES[0], 'partial file'),
      ),
      ...FILES.slice(1).map((file) => agentWritesFile(file)),
    ];

    const result = await service.analyzeWorkspace(WORKSPACE, {
      mcpServerRunning: true,
    });

    const phase = result.value!.phases['project-profile'];
    expect(phase.status).toBe('failed');
    expect(phase.error).toContain('error_during_execution');
    expect(phase.error).toContain('model exploded');
    expect(await fs.readFile(join(SLUG_DIR, FILES[0]))).toBe('partial file');
  });

  it('fails a phase with analysis_timeout when the per-phase timer fires', async () => {
    jest.useFakeTimers();
    scenarios = [
      hangingStream(),
      ...FILES.slice(1).map((file) => agentWritesFile(file)),
    ];

    const pending = service.analyzeWorkspace(WORKSPACE, {
      mcpServerRunning: true,
    });
    while (execute.mock.calls.length === 0) {
      await Promise.resolve();
    }
    await jest.advanceTimersByTimeAsync(PER_PHASE_TIMEOUT_MS + 1);
    const result = await pending;

    expect(result.isOk()).toBe(true);
    const phase = result.value!.phases['project-profile'];
    expect(phase.status).toBe('failed');
    expect(phase.error).toContain('analysis_timeout');
    expect(await fs.readFile(join(SLUG_DIR, FILES[0]))).toBe('partial output');
    expect(result.value!.phases['elevation-plan'].status).toBe('completed');
    expect(result.value!.lifecycle).toBe('failed');
    expect(execute).toHaveBeenCalledTimes(4);
  });

  it('pauses on cancel: active phase back to pending, partial file kept, slug not deleted', async () => {
    scenarios = [
      agentWritesFile(FILES[0]),
      hangingStream(() => {
        void storage.writePhaseFile(SLUG_DIR, FILES[1], 'half written');
        service.cancelAnalysis();
      }),
    ];

    const result = await service.analyzeWorkspace(WORKSPACE, {
      mcpServerRunning: true,
    });

    expect(result.isOk()).toBe(true);
    const manifest = result.value!;
    expect(manifest.lifecycle).toBe('paused');
    expect(manifest.phases['project-profile'].status).toBe('completed');
    expect(manifest.phases['architecture-assessment'].status).toBe('pending');
    expect(manifest.phases['quality-audit'].status).toBe('pending');
    expect(manifest.phases['elevation-plan'].status).toBe('pending');
    expect(execute).toHaveBeenCalledTimes(2);
    expect(await fs.readFile(join(SLUG_DIR, FILES[1]))).toBe('half written');
    expect(await fs.exists(SLUG_DIR)).toBe(true);
    expect((await readManifest()).lifecycle).toBe('paused');
  });

  describe('resume', () => {
    async function seedPausedManifest(): Promise<MultiPhaseManifestV4> {
      await fs.createDirectory(WORKSPACE);
      const fingerprint = await computeWorkspaceFingerprint(WORKSPACE, fs);
      const prompts = buildPhase1Prompts('.ptah/analysis/demo');
      const sha256 = (value: string) =>
        createHash('sha256').update(value).digest('hex');
      return {
        version: 4,
        runId: 'RUN-KEEP',
        slug: 'demo',
        analyzedAt: '2026-08-30T10:00:00.000Z',
        updatedAt: '2026-08-30T10:05:00.000Z',
        lifecycle: 'paused',
        // Same provider + model the snapshot resolves — a resumable run.
        model: 'snapshot-model',
        analysisPair: { provider: 'kimi-code', model: 'snapshot-model' },
        totalDurationMs: 5_000,
        workspaceFingerprint: fingerprint,
        phases: {
          'project-profile': {
            status: 'completed',
            file: FILES[0],
            durationMs: 10,
            attempt: 1,
            sessionId: 'old-sdk-session',
            input: {
              workspaceSha256: fingerprint.digest,
              promptSha256: sha256(
                JSON.stringify([prompts.systemPrompt, prompts.userPrompt]),
              ),
              priorPhaseSha256: null,
              provider: 'kimi-code',
              model: 'snapshot-model',
            },
            verification: {
              status: 'verified',
              outputSha256: sha256('OLD PROFILE'),
              checkedAt: '2026-08-30T10:00:00.000Z',
            },
          },
          'architecture-assessment': {
            status: 'running',
            file: FILES[1],
            durationMs: 0,
            attempt: 1,
            sessionId: null,
            input: null,
            verification: {
              status: 'pending',
              outputSha256: null,
              checkedAt: null,
            },
          },
          'quality-audit': {
            status: 'pending',
            file: FILES[2],
            durationMs: 0,
            attempt: 0,
            sessionId: null,
            input: null,
            verification: {
              status: 'pending',
              outputSha256: null,
              checkedAt: null,
            },
          },
          'elevation-plan': {
            status: 'pending',
            file: FILES[3],
            durationMs: 0,
            attempt: 0,
            sessionId: null,
            input: null,
            verification: {
              status: 'pending',
              outputSha256: null,
              checkedAt: null,
            },
          },
        },
      };
    }

    function seedLegacyManifest(): MultiPhaseManifestV3 {
      const phases = Object.fromEntries(
        PHASE_CONFIGS.map((config) => [
          config.id,
          {
            status: config.id === 'project-profile' ? 'completed' : 'pending',
            file: config.file,
            durationMs: 0,
          },
        ]),
      ) as MultiPhaseManifestV3['phases'];
      return {
        version: 3,
        runId: 'LEGACY-RUN',
        slug: 'demo',
        analyzedAt: '2026-08-30T10:00:00.000Z',
        updatedAt: '2026-08-30T10:05:00.000Z',
        lifecycle: 'paused',
        model: 'snapshot-model',
        totalDurationMs: 1_000,
        phases,
      };
    }

    it('skips completed phases, restarts a stale running phase and keeps the runId', async () => {
      await storage.writeManifest(SLUG_DIR, await seedPausedManifest());
      await storage.writePhaseFile(SLUG_DIR, FILES[0], 'OLD PROFILE');
      await storage.writePhaseFile(SLUG_DIR, FILES[1], 'stale partial');
      fs.writeFile.mockClear();
      scenarios = FILES.slice(1).map((file) => agentWritesFile(file));

      const result = await service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
        resume: true,
      });

      expect(result.isOk()).toBe(true);
      const manifest = result.value!;
      expect(manifest.runId).toBe('RUN-KEEP');
      expect(manifest.model).toBe('snapshot-model');
      expect(manifest.lifecycle).toBe('completed');
      expect(manifest.totalDurationMs).toBeGreaterThanOrEqual(5_000);
      if (manifest.version === 4) {
        expect(manifest.phases['project-profile'].attempt).toBe(1);
        expect(manifest.phases['architecture-assessment'].attempt).toBe(2);
      }
      expect(execute).toHaveBeenCalledTimes(3);
      expect(fs.delete).toHaveBeenCalledWith(join(SLUG_DIR, FILES[1]));
      expect(await fs.readFile(join(SLUG_DIR, FILES[0]))).toBe('OLD PROFILE');
      expect(await fs.readFile(join(SLUG_DIR, FILES[1]))).toContain(
        'agent wrote',
      );
      // The first checkpoint of the resumed run normalized `running` to `pending`.
      const firstWrite = manifestWrites()[0];
      expect(firstWrite.phases['architecture-assessment'].status).toBe(
        'pending',
      );
      expect(firstWrite.lifecycle).toBe('running');
    });

    it('reuses a completed phase after its markdown is copied with CRLF', async () => {
      const manifest = await seedPausedManifest();
      if (manifest.version !== 4) throw new Error('Expected v4 fixture');
      manifest.phases['project-profile'].verification.outputSha256 = createHash(
        'sha256',
      )
        .update('OLD\nPROFILE')
        .digest('hex');
      await storage.writeManifest(SLUG_DIR, manifest);
      await fs.writeFile(join(SLUG_DIR, FILES[0]), 'OLD\r\nPROFILE');
      scenarios = FILES.slice(1).map((file) => agentWritesFile(file));

      const result = await service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
        resume: true,
      });

      expect(result.isOk()).toBe(true);
      expect(execute).toHaveBeenCalledTimes(3);
      expect(
        (result.value as MultiPhaseManifestV4).phases['project-profile']
          .attempt,
      ).toBe(1);
    });

    // A FAILED or PAUSED run leaves its lossy diagnostic text on disk and
    // nothing deletes it, so on resume the phase file is already there before
    // the agent starts. It must never stand in for output this run produced.
    const STALE_STUB = '# Architecture Assessment\n(run was interrupted)';

    it('replaces the stale phase file when the resumed phase succeeds without writing it', async () => {
      await storage.writeManifest(SLUG_DIR, await seedPausedManifest());
      await storage.writePhaseFile(SLUG_DIR, FILES[0], 'OLD PROFILE');
      await storage.writePhaseFile(SLUG_DIR, FILES[1], STALE_STUB);
      scenarios = [
        // Succeeds, returns text, writes NO file — the F2 failure mode.
        streamOf([
          assistant('fresh architecture text'),
          success('fresh architecture text'),
        ]),
        ...FILES.slice(2).map((file) => agentWritesFile(file)),
      ];

      const result = await service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
        resume: true,
      });

      expect(result.isOk()).toBe(true);
      const phase = result.value!.phases['architecture-assessment'];
      expect(phase.status).toBe('completed');
      const file = await fs.readFile(join(SLUG_DIR, FILES[1]));
      expect(file).toBe('fresh architecture text');
      expect(file).not.toContain('run was interrupted');
    });

    it('completes an identical rewrite when its modification time advances without overwriting the file', async () => {
      let phaseMtime = 100;
      fs.stat.mockImplementation(async () => ({
        type: 1,
        ctime: 0,
        mtime: phaseMtime,
        size: STALE_STUB.length,
      }));
      await storage.writeManifest(SLUG_DIR, await seedPausedManifest());
      await storage.writePhaseFile(SLUG_DIR, FILES[0], 'OLD PROFILE');
      await storage.writePhaseFile(SLUG_DIR, FILES[1], STALE_STUB);
      scenarios = [
        streamOf([assistant('Done.'), success('Done.')], async () => {
          await storage.writePhaseFile(SLUG_DIR, FILES[1], STALE_STUB);
          phaseMtime = 200;
        }),
        ...FILES.slice(2).map((file) => agentWritesFile(file)),
      ];

      const result = await service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
        resume: true,
      });

      expect(result.value!.phases['architecture-assessment'].status).toBe(
        'completed',
      );
      expect(await fs.readFile(join(SLUG_DIR, FILES[1]))).toBe(STALE_STUB);
      expect(await fs.readFile(join(SLUG_DIR, FILES[1]))).not.toBe('Done.');
    });

    it('completes an identical rewrite when its modification time is unchanged without overwriting the file', async () => {
      fs.stat.mockResolvedValue({
        type: 1,
        ctime: 0,
        mtime: 100,
        size: STALE_STUB.length,
      });
      await storage.writeManifest(SLUG_DIR, await seedPausedManifest());
      await storage.writePhaseFile(SLUG_DIR, FILES[0], 'OLD PROFILE');
      await storage.writePhaseFile(SLUG_DIR, FILES[1], STALE_STUB);
      scenarios = [
        streamOf([assistant('Done.'), success('Done.')], () =>
          storage.writePhaseFile(SLUG_DIR, FILES[1], STALE_STUB),
        ),
        ...FILES.slice(2).map((file) => agentWritesFile(file)),
      ];

      const result = await service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
        resume: true,
      });

      expect(result.value!.phases['architecture-assessment'].status).toBe(
        'completed',
      );
      expect(await fs.readFile(join(SLUG_DIR, FILES[1]))).toBe(STALE_STUB);
      expect(await fs.readFile(join(SLUG_DIR, FILES[1]))).not.toBe('Done.');
    });

    it('rejects an unchanged stale file when the resumed phase writes nothing', async () => {
      await storage.writeManifest(SLUG_DIR, await seedPausedManifest());
      await storage.writePhaseFile(SLUG_DIR, FILES[0], 'OLD PROFILE');
      await storage.writePhaseFile(SLUG_DIR, FILES[1], STALE_STUB);
      scenarios = [
        // Succeeds, writes no file, says nothing.
        streamOf([success()]),
        ...FILES.slice(2).map((file) => agentWritesFile(file)),
      ];

      const result = await service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
        resume: true,
      });

      const phase = result.value!.phases['architecture-assessment'];
      expect(phase.status).toBe('failed');
      expect(phase.error).toBe(
        'Agent did not write the phase file and no text was captured',
      );
      expect(result.value!.lifecycle).toBe('failed');
      expect(await fs.readFile(join(SLUG_DIR, FILES[1]))).toBe(STALE_STUB);
    });

    it('restores the stale phase file when a resumed phase is paused before writing', async () => {
      await storage.writeManifest(SLUG_DIR, await seedPausedManifest());
      await storage.writePhaseFile(SLUG_DIR, FILES[0], 'OLD PROFILE');
      await storage.writePhaseFile(SLUG_DIR, FILES[1], STALE_STUB);
      scenarios = [
        hangingStream(() => {
          service.cancelAnalysis();
        }),
      ];

      const result = await service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
        resume: true,
      });

      expect(result.value!.lifecycle).toBe('paused');
      expect(result.value!.phases['architecture-assessment'].status).toBe(
        'pending',
      );
      expect(await fs.readFile(join(SLUG_DIR, FILES[1]))).toBe(STALE_STUB);
    });

    it('retains the content and mtime fallback when stale-file removal is unavailable', async () => {
      fs.delete.mockRejectedValue(new Error('delete unavailable'));
      fs.stat.mockResolvedValue({
        type: 1,
        ctime: 0,
        mtime: 100,
        size: STALE_STUB.length,
      });
      await storage.writeManifest(SLUG_DIR, await seedPausedManifest());
      await storage.writePhaseFile(SLUG_DIR, FILES[0], 'OLD PROFILE');
      await storage.writePhaseFile(SLUG_DIR, FILES[1], STALE_STUB);
      scenarios = [
        streamOf([assistant('Done.'), success('Done.')], () =>
          storage.writePhaseFile(SLUG_DIR, FILES[1], STALE_STUB),
        ),
        ...FILES.slice(2).map((file) => agentWritesFile(file)),
      ];

      const result = await service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
        resume: true,
      });

      expect(result.value!.phases['architecture-assessment'].status).toBe(
        'completed',
      );
      expect(await fs.readFile(join(SLUG_DIR, FILES[1]))).toBe('Done.');
    });

    it('falls back to changed content when the provider cannot report modification times', async () => {
      fs.stat.mockRejectedValue(new Error('stat unavailable'));
      await storage.writeManifest(SLUG_DIR, await seedPausedManifest());
      await storage.writePhaseFile(SLUG_DIR, FILES[0], 'OLD PROFILE');
      await storage.writePhaseFile(SLUG_DIR, FILES[1], STALE_STUB);
      const rewrittenContent = '# Architecture Assessment\nComplete analysis';
      scenarios = [
        streamOf([assistant('Done.'), success('Done.')], () =>
          storage.writePhaseFile(SLUG_DIR, FILES[1], rewrittenContent),
        ),
        ...FILES.slice(2).map((file) => agentWritesFile(file)),
      ];

      const result = await service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
        resume: true,
      });

      expect(result.value!.phases['architecture-assessment'].status).toBe(
        'completed',
      );
      expect(await fs.readFile(join(SLUG_DIR, FILES[1]))).toBe(
        rewrittenContent,
      );
    });

    it('falls back to a fresh run when no resumable manifest exists', async () => {
      scenarios = FILES.map((file) => agentWritesFile(file));

      const result = await service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
        resume: true,
      });

      expect(result.isOk()).toBe(true);
      expect(result.value!.runId).toHaveLength(26);
      expect(execute).toHaveBeenCalledTimes(4);
    });

    it('starts fresh instead of resuming when the workspace now resolves a different model', async () => {
      // The run was paused on another model; the workspace's provider/model
      // has changed since. Resuming would finish it on a second model.
      const paused = await seedPausedManifest();
      await storage.writeManifest(SLUG_DIR, {
        ...paused,
        model: 'old-provider-model',
        analysisPair: { provider: 'kimi-code', model: 'old-provider-model' },
      });
      await storage.writePhaseFile(SLUG_DIR, FILES[0], 'OLD PROFILE');
      scenarios = FILES.map((file) => agentWritesFile(file));

      const result = await service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
        resume: true,
      });

      expect(result.isOk()).toBe(true);
      const manifest = result.value!;
      expect(manifest.runId).not.toBe('RUN-KEEP');
      expect(manifest.model).toBe('snapshot-model');
      expect(manifest.lifecycle).toBe('completed');
      // Every phase re-ran on the new model, including the one completed before.
      expect(execute).toHaveBeenCalledTimes(4);
      for (const [call] of execute.mock.calls) {
        expect((call as unknown as { model: string }).model).toBe(
          'snapshot-model',
        );
      }
      expect(await fs.readFile(join(SLUG_DIR, FILES[0]))).not.toBe(
        'OLD PROFILE',
      );
    });

    it('starts fresh instead of resuming on a provider-only change with the same model ID', async () => {
      const paused = await seedPausedManifest();
      const phase1Input = paused.phases['project-profile'].input;
      if (!phase1Input) throw new Error('Expected phase 1 input');
      paused.model = 'shared-model-id';
      paused.analysisPair = {
        provider: 'provider-a',
        model: 'shared-model-id',
      };
      paused.phases['project-profile'].input = {
        ...phase1Input,
        provider: 'provider-a',
        model: 'shared-model-id',
      };
      await storage.writeManifest(SLUG_DIR, paused);
      await storage.writePhaseFile(SLUG_DIR, FILES[0], 'OLD PROFILE');
      scenarios = FILES.map((file) => agentWritesFile(file));

      const providerBAuth = {
        env: { ANTHROPIC_AUTH_TOKEN: 'provider-b-secret' },
      };
      const result = await service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
        resume: true,
        setupSnapshot: {
          providerId: 'provider-b',
          model: 'shared-model-id',
          auth: providerBAuth,
        },
      });

      expect(result.isOk()).toBe(true);
      const manifest = result.value as MultiPhaseManifestV4;
      expect(manifest.runId).not.toBe('RUN-KEEP');
      expect(manifest.model).toBe('shared-model-id');
      expect(manifest.analysisPair).toEqual({
        provider: 'provider-b',
        model: 'shared-model-id',
      });
      expect(execute).toHaveBeenCalledTimes(4);
      for (const [call] of execute.mock.calls) {
        const config = call as unknown as { model: string; auth: unknown };
        expect(config.model).toBe('shared-model-id');
        expect(config.auth).toBe(providerBAuth);
      }
      expect(manifest.phases['project-profile'].input?.provider).toBe(
        'provider-b',
      );
      expect(await fs.readFile(join(SLUG_DIR, FILES[0]))).not.toBe(
        'OLD PROFILE',
      );
      const rawManifest = await fs.readFile(join(SLUG_DIR, 'manifest.json'));
      expect(rawManifest).not.toContain('provider-b-secret');
      expect(rawManifest).not.toContain('"auth"');
    });

    it('does not reuse a completed phase on a provider-only input mismatch with the same model ID', async () => {
      const paused = await seedPausedManifest();
      const phase1Input = paused.phases['project-profile'].input;
      if (!phase1Input) throw new Error('Expected phase 1 input');
      paused.phases['project-profile'].input = {
        ...phase1Input,
        provider: 'different-provider',
        model: 'snapshot-model',
      };
      await storage.writeManifest(SLUG_DIR, paused);
      await storage.writePhaseFile(SLUG_DIR, FILES[0], 'OLD PROFILE');
      scenarios = FILES.map((file) => agentWritesFile(file));

      const result = await service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
        resume: true,
      });

      expect(result.isOk()).toBe(true);
      const manifest = result.value as MultiPhaseManifestV4;
      expect(manifest.runId).toBe('RUN-KEEP');
      expect(execute).toHaveBeenCalledTimes(4);
      expect(manifest.phases['project-profile'].attempt).toBe(2);
      expect(manifest.phases['project-profile'].input?.provider).toBe(
        'kimi-code',
      );
      expect(await fs.readFile(join(SLUG_DIR, FILES[0]))).not.toBe(
        'OLD PROFILE',
      );
    });

    it('does not reuse a completed phase whose input omits provider even when manifest analysisPair matches', async () => {
      const paused = await seedPausedManifest();
      const phase1Input = paused.phases['project-profile'].input;
      if (!phase1Input) throw new Error('Expected phase 1 input');
      const { provider: _omitted, ...legacyInput } = phase1Input;
      paused.phases['project-profile'].input = legacyInput;
      await storage.writeManifest(SLUG_DIR, paused);
      await storage.writePhaseFile(SLUG_DIR, FILES[0], 'OLD PROFILE');
      scenarios = FILES.map((file) => agentWritesFile(file));

      const result = await service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
        resume: true,
      });

      expect(result.isOk()).toBe(true);
      const manifest = result.value as MultiPhaseManifestV4;
      expect(execute).toHaveBeenCalledTimes(4);
      expect(manifest.phases['project-profile'].input?.provider).toBe(
        'kimi-code',
      );
    });

    it('starts fresh instead of resuming a legacy pair-less unfinished v4 checkpoint', async () => {
      const paused = await seedPausedManifest();
      delete paused.analysisPair;
      if (paused.phases['project-profile'].input) {
        delete paused.phases['project-profile'].input.provider;
      }
      await storage.writeManifest(SLUG_DIR, paused);
      await storage.writePhaseFile(SLUG_DIR, FILES[0], 'OLD PROFILE');
      scenarios = FILES.map((file) => agentWritesFile(file));

      const result = await service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
        resume: true,
      });

      expect(result.isOk()).toBe(true);
      const manifest = result.value as MultiPhaseManifestV4;
      expect(manifest.version).toBe(4);
      expect(manifest.runId).not.toBe('RUN-KEEP');
      expect(manifest.analysisPair).toEqual({
        provider: 'kimi-code',
        model: 'snapshot-model',
      });
      expect(execute).toHaveBeenCalledTimes(4);
      for (const config of PHASE_CONFIGS) {
        expect(manifest.phases[config.id].input?.provider).toBe('kimi-code');
      }
      expect(await fs.readFile(join(SLUG_DIR, FILES[0]))).not.toBe(
        'OLD PROFILE',
      );
    });

    it('does not resume a version-2 manifest', async () => {
      await fs.writeFile(
        join(SLUG_DIR, 'manifest.json'),
        JSON.stringify({ version: 2, slug: 'demo', phases: {} }),
      );
      scenarios = FILES.map((file) => agentWritesFile(file));

      const result = await service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
        resume: true,
      });

      expect(result.value!.version).toBe(4);
      expect(execute).toHaveBeenCalledTimes(4);
    });

    it('archives a paused v3 run and starts a distinct verified v4 run', async () => {
      const legacy = seedLegacyManifest();
      await storage.writeManifest(SLUG_DIR, legacy);
      await storage.writePhaseFile(SLUG_DIR, FILES[0], 'LEGACY PROFILE');
      scenarios = FILES.map((file) => agentWritesFile(file));

      const result = await service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
        resume: true,
      });

      expect(result.isOk()).toBe(true);
      expect(result.value!.version).toBe(4);
      expect(result.value!.runId).not.toBe(legacy.runId);
      expect(execute).toHaveBeenCalledTimes(4);
      const entries = await fs.readDirectory(storage.getAnalysisDir(WORKSPACE));
      const archive = entries.find((entry) =>
        entry.name.startsWith('demo-v3-archive-'),
      );
      expect(archive).toBeDefined();
      const archivedDir = join(
        storage.getAnalysisDir(WORKSPACE),
        archive!.name,
      );
      expect(await storage.loadManifest(archivedDir)).toEqual(legacy);
      expect(await fs.readFile(join(archivedDir, FILES[0]))).toBe(
        'LEGACY PROFILE',
      );
    });

    it('preserves v3 bytes and runs in the v4 fallback when archiving fails', async () => {
      const legacy = seedLegacyManifest();
      await storage.writeManifest(SLUG_DIR, legacy);
      await storage.writePhaseFile(SLUG_DIR, FILES[0], 'LEGACY PROFILE');
      const legacyBytes = await fs.readFile(join(SLUG_DIR, 'manifest.json'));
      fs.copy.mockRejectedValueOnce(new Error('EIO'));
      const fallbackDir = `${SLUG_DIR}--v4`;
      scenarios = FILES.map((file) =>
        streamOf(
          [assistant('fallback output'), success('fallback output')],
          () =>
            storage.writePhaseFile(
              fallbackDir,
              file,
              `# ${file}\nfallback output`,
            ),
        ),
      );

      const result = await service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
        resume: true,
      });

      expect(result.isOk()).toBe(true);
      expect(result.value?.version).toBe(4);
      expect(result.value?.slug).toBe('demo--v4');
      expect(execute).toHaveBeenCalledTimes(4);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Analysis run opened'),
        expect.objectContaining({ slugDir: fallbackDir }),
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('archive failed'),
        expect.objectContaining({ archiveDir: null }),
      );
      expect(await storage.loadManifest(SLUG_DIR)).toEqual(legacy);
      expect(await fs.readFile(join(SLUG_DIR, 'manifest.json'))).toBe(
        legacyBytes,
      );
      expect(await fs.readFile(join(SLUG_DIR, FILES[0]))).toBe(
        'LEGACY PROFILE',
      );
      expect((await storage.loadManifest(fallbackDir))?.runId).toBe(
        result.value?.runId,
      );
    });

    it('resumes a paused fallback run after archive failure', async () => {
      await storage.writeManifest(SLUG_DIR, seedLegacyManifest());
      const fallbackDir = `${SLUG_DIR}--v4`;
      const paused = await seedPausedManifest();
      await storage.writeManifest(fallbackDir, { ...paused, slug: 'demo--v4' });
      fs.copy.mockRejectedValueOnce(new Error('EIO'));
      scenarios = FILES.map((file) =>
        streamOf([assistant('resumed'), success('resumed')], () =>
          storage.writePhaseFile(fallbackDir, file, `# ${file}\nresumed`),
        ),
      );

      const result = await service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
        resume: true,
      });

      expect(result.isOk()).toBe(true);
      expect(result.value?.runId).toBe('RUN-KEEP');
      expect(result.value?.slug).toBe('demo--v4');
      expect((await storage.loadManifest(fallbackDir))?.lifecycle).toBe(
        'completed',
      );
    });

    it('continues with an unmatchable fingerprint when fingerprinting fails', async () => {
      fs.readDirectory.mockRejectedValueOnce(new Error('fingerprint EIO'));
      scenarios = FILES.map((file) => agentWritesFile(file));

      const result = await service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
      });

      expect(result.isOk()).toBe(true);
      expect(result.value?.version).toBe(4);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('fingerprint failed'),
        expect.any(Error),
      );
    });

    it('fails a phase when hashing its output fails after the SDK result', async () => {
      scenarios = [
        streamOf([assistant('written'), success('written')], async () => {
          await storage.writePhaseFile(SLUG_DIR, FILES[0], 'written');
          fs.readFileBytes.mockRejectedValueOnce(new Error('hash EIO'));
        }),
        ...FILES.slice(1).map((file) => agentWritesFile(file)),
      ];

      const result = await service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
      });

      expect(result.isOk()).toBe(true);
      expect(result.value?.phases['project-profile'].status).toBe('failed');
      expect(result.value?.phases['project-profile'].error).toContain(
        'hash EIO',
      );
      expect(result.value?.lifecycle).toBe('failed');
      expect((await storage.loadManifest(SLUG_DIR))?.lifecycle).toBe('failed');
    });

    it('invalidates a changed output and every downstream completed phase', async () => {
      scenarios = FILES.map((file) => agentWritesFile(file));
      const first = await service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
      });
      expect(first.isOk()).toBe(true);
      await storage.writeManifest(SLUG_DIR, {
        ...(first.value as MultiPhaseManifestV4),
        lifecycle: 'paused',
      });
      await storage.writePhaseFile(SLUG_DIR, FILES[0], 'CHANGED PROFILE');
      execute.mockClear();
      scenarios = FILES.map((file) => agentWritesFile(file));

      const resumed = await service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
        resume: true,
      });

      expect(resumed.isOk()).toBe(true);
      expect(execute).toHaveBeenCalledTimes(4);
      for (const config of PHASE_CONFIGS) {
        expect(
          (resumed.value as MultiPhaseManifestV4).phases[config.id].attempt,
        ).toBe(2);
        expect(
          (resumed.value as MultiPhaseManifestV4).phases[config.id].verification
            .status,
        ).toBe('verified');
      }
    });

    it('fresh runs start with a new runId and pending phases', async () => {
      await storage.writeManifest(SLUG_DIR, await seedPausedManifest());
      scenarios = FILES.map((file) => agentWritesFile(file));

      const result = await service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
      });

      expect(result.value!.runId).not.toBe('RUN-KEEP');
      expect(execute).toHaveBeenCalledTimes(4);
    });
  });

  it('returns an error and starts no SDK work when the first checkpoint cannot be written', async () => {
    fs.writeFile.mockRejectedValueOnce(new Error('EROFS'));
    scenarios = FILES.map((file) => agentWritesFile(file));

    const result = await service.analyzeWorkspace(WORKSPACE, {
      mcpServerRunning: true,
    });

    expect(result.isErr()).toBe(true);
    expect(result.error?.message).toBe('EROFS');
    expect(execute).not.toHaveBeenCalled();
  });

  it('broadcasts scan progress with per-phase statuses', async () => {
    scenarios = FILES.map((file) => agentWritesFile(file));

    await service.analyzeWorkspace(WORKSPACE, { mcpServerRunning: true });

    const progress = broadcastMessage.mock.calls
      .map(([, payload]) => payload as { phaseStatuses?: unknown })
      .filter((payload) => payload && Array.isArray(payload.phaseStatuses));
    expect(progress.length).toBeGreaterThan(0);
    const last = progress.at(-1) as {
      phaseStatuses: Array<{ status: string }>;
    };
    expect(last.phaseStatuses.every((s) => s.status === 'completed')).toBe(
      true,
    );
  });

  describe('Setup pair resolution and isolation', () => {
    it('uses the supplied setupSnapshot across every phase, ignores options.model, and never persists auth', async () => {
      scenarios = FILES.map((file) => agentWritesFile(file));
      const setupAuth = {
        env: { ANTHROPIC_API_KEY: 'setup-ephemeral-secret' },
      };

      const result = await service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
        model: 'legacy-client-model',
        setupSnapshot: {
          providerId: 'setup-provider',
          model: 'setup-model',
          auth: setupAuth,
        },
      });

      expect(result.isOk()).toBe(true);
      expect(resolveSetup).not.toHaveBeenCalled();
      expect(resolveLlm).not.toHaveBeenCalled();
      expect(execute).toHaveBeenCalledTimes(4);
      for (const [call] of execute.mock.calls) {
        const config = call as unknown as {
          model: string;
          auth: unknown;
          cwd: string;
        };
        expect(config.model).toBe('setup-model');
        expect(config.auth).toBe(setupAuth);
        expect(config.cwd).toBe(WORKSPACE);
      }
      const manifest = result.value as MultiPhaseManifestV4;
      expect(manifest.analysisPair).toEqual({
        provider: 'setup-provider',
        model: 'setup-model',
      });
      const rawManifest = await fs.readFile(join(SLUG_DIR, 'manifest.json'));
      expect(rawManifest).not.toContain('setup-ephemeral-secret');
      expect(rawManifest).not.toContain('setupSnapshot');
      expect(rawManifest).not.toContain('"auth"');
    });

    it('Unset Setup dispatches concrete workspace pair and isolated auth at every phase, ignoring conflicting chat picker and tab override', async () => {
      const workspaceProvider = 'ws-provider';
      const workspaceModel = 'ws-concrete-model';
      const chatPickerModel = 'chat-picker-conflict-model';
      const chatTabOverrideModel = 'chat-tab-override-conflict-model';
      const workspaceAuth = {
        env: { ANTHROPIC_AUTH_TOKEN: 'ws-isolated-secret' },
      };

      // Conflicting fixtures: picker !== workspace and tab override !== both.
      expect(chatPickerModel).not.toBe(workspaceModel);
      expect(chatTabOverrideModel).not.toBe(workspaceModel);
      expect(chatTabOverrideModel).not.toBe(chatPickerModel);

      resolveLlm.mockResolvedValue({
        providerId: 'picker-provider',
        model: chatPickerModel,
        auth: { env: { ANTHROPIC_AUTH_TOKEN: 'picker-secret' } },
      });
      resolveSetup.mockResolvedValue({
        kind: 'unset',
        snapshot: {
          providerId: workspaceProvider,
          model: workspaceModel,
          auth: workspaceAuth,
        },
      });
      scenarios = FILES.map((file) => agentWritesFile(file));

      const result = await service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
        // Even if a legacy caller forwards the conflicting chat-tab override,
        // Setup analysis must drop it and use the resolved workspace pair.
        model: chatTabOverrideModel,
      });

      expect(result.isOk()).toBe(true);
      expect(resolveSetup).toHaveBeenCalledTimes(1);
      expect(resolveSetup).toHaveBeenCalledWith(WORKSPACE);
      expect(resolveLlm).not.toHaveBeenCalled();
      expect(execute).toHaveBeenCalledTimes(4);
      for (const [call] of execute.mock.calls) {
        const config = call as unknown as {
          model: string;
          auth: unknown;
          cwd: string;
        };
        expect(config.model).toBe(workspaceModel);
        expect(config.model).not.toBe(chatPickerModel);
        expect(config.model).not.toBe(chatTabOverrideModel);
        expect(config.auth).toBe(workspaceAuth);
        expect(config.auth).toBeDefined();
        expect(config.cwd).toBe(WORKSPACE);
      }
      const manifest = result.value as MultiPhaseManifestV4;
      expect(manifest.analysisPair).toEqual({
        provider: workspaceProvider,
        model: workspaceModel,
      });
      const rawManifest = await fs.readFile(join(SLUG_DIR, 'manifest.json'));
      expect(rawManifest).not.toContain('ws-isolated-secret');
      expect(rawManifest).not.toContain('"auth"');
    });

    it('fails pre-phase with a named error on invalid or unavailable Setup and leaves completed records untouched', async () => {
      // Seed an existing completed legacy v4 manifest to prove blocked launches
      // never mutate completed records.
      const fingerprint = await computeWorkspaceFingerprint(WORKSPACE, fs);
      const completedHash = 'b'.repeat(64);
      const completedPhases = Object.fromEntries(
        PHASE_CONFIGS.map((c) => [
          c.id,
          {
            status: 'completed' as const,
            file: c.file,
            durationMs: 10,
            attempt: 1,
            sessionId: 'completed-session',
            input: {
              workspaceSha256: fingerprint.digest,
              promptSha256: completedHash,
              priorPhaseSha256: null,
              model: 'earlier-model',
            },
            verification: {
              status: 'verified' as const,
              outputSha256: completedHash,
              checkedAt: '2026-08-30T10:00:00.000Z',
            },
          },
        ]),
      ) as MultiPhaseManifestV4['phases'];
      await storage.writeManifest(SLUG_DIR, {
        version: 4,
        runId: 'COMPLETED-KEEP',
        slug: 'demo',
        analyzedAt: '2026-08-30T10:00:00.000Z',
        updatedAt: '2026-08-30T10:05:00.000Z',
        lifecycle: 'completed',
        model: 'earlier-model',
        totalDurationMs: 40,
        workspaceFingerprint: fingerprint,
        phases: completedPhases,
      });
      const completedBytesBefore = await fs.readFile(
        join(SLUG_DIR, 'manifest.json'),
      );

      const failures = [
        {
          resolution: {
            kind: 'invalid' as const,
            source: 'setup' as const,
            provider: 'kimi-code',
            model: 'kimi-k2',
            cause: 'not-signed-in' as const,
          },
          expectedSubstrings: ['Setup model', 'kimi-code', 'not-signed-in'],
          forbiddenSubstrings: ['Workspace model'],
        },
        {
          resolution: {
            kind: 'invalid' as const,
            source: 'setup' as const,
            provider: 'anthropic',
            model: 'sonnet',
            cause: 'model-stale' as const,
          },
          expectedSubstrings: [
            'Setup model',
            'anthropic/sonnet',
            'model-stale',
          ],
          forbiddenSubstrings: ['Workspace model'],
        },
        {
          resolution: {
            kind: 'invalid' as const,
            source: 'workspace' as const,
            provider: 'anthropic',
            model: null,
            cause: 'model-missing' as const,
          },
          expectedSubstrings: ['Workspace model', 'anthropic', 'model-missing'],
          forbiddenSubstrings: ['Setup model'],
        },
        {
          resolution: {
            kind: 'unavailable' as const,
            source: 'setup' as const,
            provider: 'proxy-provider',
            model: 'proxy-model',
            cause: 'provider-unavailable' as const,
          },
          expectedSubstrings: [
            'Setup model',
            'proxy-provider/proxy-model',
            'provider-unavailable',
          ],
          forbiddenSubstrings: ['Workspace model'],
        },
      ];

      for (const testCase of failures) {
        resolveSetup.mockResolvedValueOnce(testCase.resolution);
        const result = await service.analyzeWorkspace(WORKSPACE, {
          mcpServerRunning: true,
        });
        expect(result.isErr()).toBe(true);
        for (const fragment of testCase.expectedSubstrings) {
          expect(result.error?.message).toContain(fragment);
        }
        for (const forbidden of testCase.forbiddenSubstrings) {
          expect(result.error?.message).not.toContain(forbidden);
        }
      }

      expect(execute).not.toHaveBeenCalled();
      expect(await fs.readFile(join(SLUG_DIR, 'manifest.json'))).toBe(
        completedBytesBefore,
      );
    });

    it('keeps the launch snapshot across in-flight phases even if Setup changes mid-run', async () => {
      const initialAuth = { env: { ANTHROPIC_AUTH_TOKEN: 'launch-secret' } };
      resolveSetup.mockResolvedValueOnce({
        kind: 'set',
        snapshot: {
          providerId: 'initial-provider',
          model: 'initial-model',
          auth: initialAuth,
        },
      });
      scenarios = [
        streamOf([assistant('p1'), success('p1')], async () => {
          await storage.writePhaseFile(SLUG_DIR, FILES[0], '# p1');
          // Simulate Setup changing mid-run before phases 2-4 begin.
          resolveSetup.mockResolvedValue({
            kind: 'set',
            snapshot: {
              providerId: 'mutated-provider',
              model: 'mutated-model',
              auth: { env: { ANTHROPIC_AUTH_TOKEN: 'mutated-secret' } },
            },
          });
        }),
        ...FILES.slice(1).map((file) => agentWritesFile(file)),
      ];

      const result = await service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
      });

      expect(result.isOk()).toBe(true);
      expect(resolveSetup).toHaveBeenCalledTimes(1);
      expect(execute).toHaveBeenCalledTimes(4);
      for (const [call] of execute.mock.calls) {
        const config = call as unknown as { model: string; auth: unknown };
        expect(config.model).toBe('initial-model');
        expect(config.auth).toBe(initialAuth);
      }
      const manifest = result.value as MultiPhaseManifestV4;
      expect(manifest.analysisPair).toEqual({
        provider: 'initial-provider',
        model: 'initial-model',
      });
    });

    it('names the Analysis pair in phase errors after a valid start without leaking credentials', async () => {
      const secretAuth = { env: { ANTHROPIC_API_KEY: 'top-secret-token' } };
      scenarios = [
        streamOf([assistant('partial'), errorResult()], () =>
          storage.writePhaseFile(SLUG_DIR, FILES[0], 'partial'),
        ),
        () => {
          throw new Error('upstream 502');
        },
        agentWritesFile(FILES[2]),
        agentWritesFile(FILES[3]),
      ];

      const result = await service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
        setupSnapshot: {
          providerId: 'setup-provider',
          model: 'setup-model',
          auth: secretAuth,
        },
      });

      expect(result.isOk()).toBe(true);
      const manifest = result.value;
      if (!manifest) throw new Error('Expected manifest');
      const phase1 = manifest.phases['project-profile'];
      const phase2 = manifest.phases['architecture-assessment'];
      expect(phase1.status).toBe('failed');
      expect(phase1.error).toContain('setup-provider/setup-model');
      expect(phase1.error).not.toContain('top-secret-token');
      expect(phase2.status).toBe('failed');
      expect(phase2.error).toContain('upstream 502');
      expect(phase2.error).toContain('setup-provider/setup-model');
      expect(phase2.error).not.toContain('top-secret-token');
    });
  });

  it('executes quality-audit with higher maxTurns (120) and other phases with 50', async () => {
    scenarios = FILES.map((file) => agentWritesFile(file));

    const result = await service.analyzeWorkspace(WORKSPACE, {
      mcpServerRunning: true,
    });

    expect(result.isOk()).toBe(true);
    expect(execute).toHaveBeenCalledTimes(4);
    expect(execute.mock.calls[0][0].maxTurns).toBe(
      PHASE_MAX_AGENT_TURNS['project-profile'],
    );
    expect(execute.mock.calls[1][0].maxTurns).toBe(
      PHASE_MAX_AGENT_TURNS['architecture-assessment'],
    );
    expect(execute.mock.calls[2][0].maxTurns).toBe(
      PHASE_MAX_AGENT_TURNS['quality-audit'],
    );
    expect(execute.mock.calls[2][0].maxTurns).toBe(120);
    expect(execute.mock.calls[3][0].maxTurns).toBe(
      PHASE_MAX_AGENT_TURNS['elevation-plan'],
    );
    expect(execute.mock.calls[3][0].maxTurns).toBe(DEFAULT_MAX_AGENT_TURNS);
  });

  it('records a phase as completed when error_max_turns occurs with substantial UTF-8 content', async () => {
    // 415 ASCII characters + 38 CJK 3-byte characters = 453 code units, 529 UTF-8 bytes.
    // This specifically verifies Buffer.byteLength is used instead of string.length.
    const baseAscii =
      '# Phase 3: Quality Audit Report\n' +
      '## Framework Compliance\n' +
      '- Angular 22 standalone components validated across all webview libraries.\n' +
      '- OnPush change detection applied consistently.\n' +
      '## Type Safety Assessment\n' +
      '- Strict null checks active, zero unsafe type assertions detected in main paths.\n' +
      '## Security & Error Boundaries\n' +
      '- DOMPurify sanitization active, no raw innerHTML usage found in components.\n' +
      '## Preliminary Findings\n';
    const cjkSection =
      '【品質監査詳細】検証済みコンポーネントおよびサービス群の品質基準適合状況確認。';
    const substantialAuditContent = baseAscii + cjkSection;

    expect(substantialAuditContent.length).toBeLessThan(
      SUBSTANTIAL_PHASE_FILE_MIN_BYTES,
    );
    expect(
      Buffer.byteLength(substantialAuditContent, 'utf8'),
    ).toBeGreaterThanOrEqual(SUBSTANTIAL_PHASE_FILE_MIN_BYTES);

    scenarios = [
      agentWritesFile(FILES[0]),
      agentWritesFile(FILES[1]),
      streamOf(
        [assistant('One sentence captured text.'), maxTurnsResult()],
        () =>
          storage.writePhaseFile(SLUG_DIR, FILES[2], substantialAuditContent),
      ),
      agentWritesFile(FILES[3]),
    ];

    const result = await service.analyzeWorkspace(WORKSPACE, {
      mcpServerRunning: true,
    });

    expect(result.isOk()).toBe(true);
    const phase = result.value?.phases['quality-audit'];
    expect(phase?.status).toBe('completed');
    const diskContent = await fs.readFile(join(SLUG_DIR, FILES[2]));
    expect(diskContent).toBe(substantialAuditContent);
    expect(diskContent).not.toContain('One sentence captured text.');
    expect(
      logger.warn.mock.calls.some(
        ([msg]) =>
          typeof msg === 'string' &&
          msg.includes('hit max turns cap') &&
          msg.includes('recording as completed with partial document'),
      ),
    ).toBe(true);
  });

  it('marks phase failed and writes diagnostic text when error_max_turns occurs with insubstantial content', async () => {
    const insubstantialContent = '# Phase 3: Quality Audit\nSkeleton only.';
    const diagnosticText = 'Short diagnostic text from assistant turns.';

    expect(Buffer.byteLength(insubstantialContent, 'utf8')).toBeLessThan(
      SUBSTANTIAL_PHASE_FILE_MIN_BYTES,
    );

    scenarios = [
      agentWritesFile(FILES[0]),
      agentWritesFile(FILES[1]),
      streamOf([assistant(diagnosticText), maxTurnsResult()], () =>
        storage.writePhaseFile(SLUG_DIR, FILES[2], insubstantialContent),
      ),
      agentWritesFile(FILES[3]),
    ];

    const result = await service.analyzeWorkspace(WORKSPACE, {
      mcpServerRunning: true,
    });

    const phase = result.value?.phases['quality-audit'];
    expect(phase?.status).toBe('failed');
    expect(phase?.error).toContain('error_max_turns');
    const diskContent = await fs.readFile(join(SLUG_DIR, FILES[2]));
    expect(diskContent).toBe(diagnosticText);
    expect(result.value?.lifecycle).toBe('failed');
  });

  describe('active run tracking and concurrent join', () => {
    it('tracks active run metadata with normalized workspace paths while running and clears on completion', async () => {
      expect(service.getActiveRun()).toBeNull();
      expect(service.isRunningForWorkspace(WORKSPACE)).toBe(false);

      const otherWorkspace = resolve('/ws/other');
      let observedActiveRun: ReturnType<
        MultiPhaseAnalysisService['getActiveRun']
      > = null;
      let observedSameWithSlash = false;
      let observedOtherWorkspace = true;
      let observedByOther: ReturnType<
        MultiPhaseAnalysisService['getActiveRun']
      > = null;

      scenarios = [
        streamOf([assistant('p1'), success('p1')], async () => {
          observedActiveRun = service.getActiveRun();
          observedSameWithSlash = service.isRunningForWorkspace(
            `${WORKSPACE}/`,
          );
          observedOtherWorkspace =
            service.isRunningForWorkspace(otherWorkspace);
          observedByOther = service.getActiveRun(otherWorkspace);
          await storage.writePhaseFile(SLUG_DIR, FILES[0], '# p1');
        }),
        ...FILES.slice(1).map((file) => agentWritesFile(file)),
      ];

      const result = await service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
      });

      expect(result.isOk()).toBe(true);
      expect(observedActiveRun).toEqual({
        workspacePath: WORKSPACE,
        runId: result.value?.runId,
        slug: 'demo',
        startedAt: expect.any(String),
      });
      expect(observedSameWithSlash).toBe(true);
      expect(observedOtherWorkspace).toBe(false);
      expect(observedByOther).toBeNull();
      expect(service.getActiveRun()).toBeNull();
      expect(service.isRunningForWorkspace(WORKSPACE)).toBe(false);
    });

    it('clears active run immediately on cancelAnalysis and does not clobber a replacement run', async () => {
      let releaseSecondRun!: () => void;
      const secondRunGate = new Promise<void>((res) => {
        releaseSecondRun = res;
      });
      let secondRunStarted!: () => void;
      const secondRunStartedPromise = new Promise<void>((res) => {
        secondRunStarted = res;
      });

      scenarios = [
        hangingStream(),
        // Second run phases:
        async function* () {
          secondRunStarted();
          await secondRunGate;
          await storage.writePhaseFile(SLUG_DIR, FILES[0], '# second p1');
          yield assistant('second p1');
          yield success('second p1');
        },
        ...FILES.slice(1).map((file) => agentWritesFile(file)),
      ];

      const firstPromise = service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
      });
      while (execute.mock.calls.length < 1) {
        await Promise.resolve();
      }
      expect(service.isRunningForWorkspace(WORKSPACE)).toBe(true);

      service.cancelAnalysis();
      expect(service.getActiveRun()).toBeNull();
      expect(service.isRunningForWorkspace(WORKSPACE)).toBe(false);

      const secondPromise = service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
      });
      await secondRunStartedPromise;

      const firstResult = await firstPromise;
      expect(firstResult.isOk()).toBe(true);
      expect(firstResult.value?.lifecycle).toBe('paused');
      // First run's finally must NOT clear the active second run.
      expect(service.isRunningForWorkspace(WORKSPACE)).toBe(true);
      expect(service.getActiveRun()?.runId).not.toBe(firstResult.value?.runId);

      releaseSecondRun();
      const secondResult = await secondPromise;
      expect(secondResult.isOk()).toBe(true);
      expect(secondResult.value?.lifecycle).toBe('completed');
      expect(service.getActiveRun()).toBeNull();
      expect(service.isRunningForWorkspace(WORKSPACE)).toBe(false);
    });

    it('joins the active run on a second same-workspace call instead of aborting or wiping the slug', async () => {
      let releasePhase1!: () => void;
      const phase1Gate = new Promise<void>((res) => {
        releasePhase1 = res;
      });
      let phase1Started!: () => void;
      const phase1StartedPromise = new Promise<void>((res) => {
        phase1Started = res;
      });

      scenarios = [
        async function* () {
          phase1Started();
          await phase1Gate;
          await storage.writePhaseFile(SLUG_DIR, FILES[0], '# p1');
          yield assistant('p1');
          yield success('p1');
        },
        ...FILES.slice(1).map((file) => agentWritesFile(file)),
      ];

      const firstCall = service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
      });
      await phase1StartedPromise;

      const secondCall = service.analyzeWorkspace(`${WORKSPACE}/`, {
        mcpServerRunning: true,
      });

      expect(resolveSetup).toHaveBeenCalledTimes(1);

      releasePhase1();
      const [firstResult, secondResult] = await Promise.all([
        firstCall,
        secondCall,
      ]);

      expect(firstResult.isOk()).toBe(true);
      expect(secondResult.isOk()).toBe(true);
      expect(secondResult.value?.runId).toBe(firstResult.value?.runId);
      expect(firstResult.value?.lifecycle).toBe('completed');
      expect(execute).toHaveBeenCalledTimes(4);
      expect(service.getActiveRun()).toBeNull();
    });

    it('joins when two same-workspace calls race while Setup is still resolving', async () => {
      let releaseSetup!: () => void;
      const setupGate = new Promise<void>((res) => {
        releaseSetup = res;
      });
      resolveSetup.mockImplementation(async () => {
        await setupGate;
        return {
          kind: 'set',
          snapshot: {
            providerId: 'kimi-code',
            model: 'snapshot-model',
            auth: SNAPSHOT_AUTH,
          },
        };
      });
      scenarios = FILES.map((file) => agentWritesFile(file));

      const firstCall = service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
      });
      const secondCall = service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
      });

      releaseSetup();
      const [firstResult, secondResult] = await Promise.all([
        firstCall,
        secondCall,
      ]);

      expect(firstResult.isOk()).toBe(true);
      expect(secondResult.isOk()).toBe(true);
      expect(secondResult.value?.runId).toBe(firstResult.value?.runId);
      expect(execute).toHaveBeenCalledTimes(4);
      expect(service.getActiveRun()).toBeNull();
    });

    it('aborts an active run when a different workspace starts analysis', async () => {
      const otherWorkspace = resolve('/ws/other');
      const otherSlugDir = join(otherWorkspace, '.ptah', 'analysis', 'other');
      await fs.createDirectory(otherWorkspace);

      let firstPhaseStarted!: () => void;
      const firstPhaseStartedPromise = new Promise<void>((res) => {
        firstPhaseStarted = res;
      });

      scenarios = [
        hangingStream(() => firstPhaseStarted()),
        ...FILES.map((file) =>
          streamOf([assistant('other'), success('other')], () =>
            storage.writePhaseFile(otherSlugDir, file, `# ${file}\nother`),
          ),
        ),
      ];

      const firstCall = service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
      });
      await firstPhaseStartedPromise;

      const secondCall = service.analyzeWorkspace(otherWorkspace, {
        mcpServerRunning: true,
      });

      const [firstResult, secondResult] = await Promise.all([
        firstCall,
        secondCall,
      ]);

      expect(firstResult.isOk()).toBe(true);
      expect(firstResult.value?.lifecycle).toBe('paused');
      expect(secondResult.isOk()).toBe(true);
      expect(secondResult.value?.lifecycle).toBe('completed');
      expect(secondResult.value?.slug).toBe('other');
      expect(service.getActiveRun()).toBeNull();
    });

    it('pre-populates activeRun.slug synchronously while AnalysisRunCheckpoint.open is pending', async () => {
      let releaseOpen!: () => void;
      const openGate = new Promise<void>((res) => {
        releaseOpen = res;
      });
      const origCreateSlugDir = storage.createSlugDir.bind(storage);
      let openReached!: () => void;
      const openReachedPromise = new Promise<void>((res) => {
        openReached = res;
      });
      jest
        .spyOn(storage, 'createSlugDir')
        .mockImplementationOnce(async (...args) => {
          openReached();
          await openGate;
          return origCreateSlugDir(...args);
        });

      scenarios = FILES.map((file) => agentWritesFile(file));

      const runPromise = service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
      });
      await openReachedPromise;

      const activeDuringOpen = service.getActiveRun(WORKSPACE);
      expect(activeDuringOpen).not.toBeNull();
      expect(activeDuringOpen?.slug).toBe('demo');
      expect(activeDuringOpen?.runId).toBeNull();

      releaseOpen();
      const result = await runPromise;
      expect(result.isOk()).toBe(true);
      expect(result.value?.slug).toBe('demo');
      expect(service.getActiveRun(WORKSPACE)).toBeNull();
    });

    it('awaits prior aborted run checkpoint.pause cleanup before opening an immediate same-workspace restart', async () => {
      let releaseFirstPauseWrite!: () => void;
      const firstPauseWriteGate = new Promise<void>((res) => {
        releaseFirstPauseWrite = res;
      });
      let pauseWriteStarted!: () => void;
      const pauseWriteStartedPromise = new Promise<void>((res) => {
        pauseWriteStarted = res;
      });
      let releaseSecondPhase!: () => void;
      const secondPhaseGate = new Promise<void>((res) => {
        releaseSecondPhase = res;
      });
      let secondPhaseStarted!: () => void;
      const secondPhaseStartedPromise = new Promise<void>((res) => {
        secondPhaseStarted = res;
      });

      const origWriteManifest = storage.writeManifest.bind(storage);
      let delayedOnce = false;
      jest
        .spyOn(storage, 'writeManifest')
        .mockImplementation(async (slugDir, manifest) => {
          if (!delayedOnce && manifest.lifecycle === 'paused') {
            delayedOnce = true;
            pauseWriteStarted();
            await firstPauseWriteGate;
          }
          return origWriteManifest(slugDir, manifest);
        });

      scenarios = [
        hangingStream(),
        async function* () {
          secondPhaseStarted();
          await secondPhaseGate;
          await storage.writePhaseFile(SLUG_DIR, FILES[0], '# second p1');
          yield assistant('second p1');
          yield success('second p1');
        },
        ...FILES.slice(1).map((file) => agentWritesFile(file)),
      ];

      const firstPromise = service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
      });
      while (execute.mock.calls.length < 1) {
        await Promise.resolve();
      }

      service.cancelAnalysis();
      const secondPromise = service.analyzeWorkspace(WORKSPACE, {
        mcpServerRunning: true,
      });

      // Wait until the aborted first run is in the middle of persisting its paused manifest.
      await pauseWriteStartedPromise;
      // Second run must NOT have started its phase yet while first run is still tearing down.
      expect(execute).toHaveBeenCalledTimes(1);

      releaseFirstPauseWrite();
      await secondPhaseStartedPromise;

      const firstResult = await firstPromise;
      expect(firstResult.isOk()).toBe(true);
      expect(firstResult.value?.lifecycle).toBe('paused');

      // Manifest on disk must belong to the active second run (`running`), never overwritten with `paused`.
      const onDisk = await storage.readManifest(SLUG_DIR);
      expect(onDisk?.kind).toBe('current');
      if (onDisk?.kind === 'current') {
        expect(onDisk.manifest.lifecycle).toBe('running');
        expect(onDisk.manifest.runId).toBe(
          service.getActiveRun(WORKSPACE)?.runId,
        );
        expect(onDisk.manifest.runId).not.toBe(firstResult.value?.runId);
      }

      releaseSecondPhase();
      const secondResult = await secondPromise;
      expect(secondResult.isOk()).toBe(true);
      expect(secondResult.value?.lifecycle).toBe('completed');
    });
  });
});
