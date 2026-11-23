import 'reflect-metadata';
import type {
  AgentRoleChannel,
  CliAdapterManifest,
  CliDetectionResult,
  CliType,
} from '@ptah-extension/shared';
import { AuthSecretsService, Logger, SentryService } from '@ptah-extension/vscode-core';
import type { IProcessSpawner } from '@ptah-extension/platform-core';
import type {
  CliAdapter,
  CliCommandOptions,
  CliModelInfo,
  CodexAdapterFactory,
  SdkHandle,
} from './cli-adapters/cli-adapter.interface';

interface MockAdapter extends CliAdapter {
  name: CliType;
  displayName: string;
  roleChannel: AgentRoleChannel;
  detect: jest.Mock<Promise<CliDetectionResult>, []>;
  capabilities: jest.Mock<CliAdapterManifest, []>;
  parseOutput: jest.Mock<string, [string]>;
  runSdk: jest.Mock<Promise<SdkHandle>, [CliCommandOptions]>;
  listModels: jest.Mock<Promise<CliModelInfo[]>, []>;
}

const mockAdapters = new Map<CliType, MockAdapter>();

function mockAdapterFor(name: CliType): MockAdapter {
  const adapter = mockAdapters.get(name);
  if (!adapter) {
    throw new Error(`no mock adapter for ${name}`);
  }
  return adapter;
}

jest.mock('./cli-adapters/copilot-sdk.adapter', () => ({
  CopilotSdkAdapter: jest.fn(() => mockAdapterFor('copilot')),
}));
jest.mock('./cli-adapters/copilot-permission-bridge', () => ({
  CopilotPermissionBridge: jest.fn(() => ({})),
}));
const mockCursorCtor = jest.fn(
  (_logger?: unknown, _resolveApiKey?: () => Promise<string | undefined>) =>
    mockAdapterFor('cursor'),
);
jest.mock('./cli-adapters/cursor-cli.adapter', () => ({
  CursorCliAdapter: mockCursorCtor,
}));
jest.mock('./cli-adapters/antigravity-cli.adapter', () => ({
  AntigravityCliAdapter: jest.fn(() => mockAdapterFor('antigravity')),
}));
jest.mock('./cli-adapters/opencode-cli.adapter', () => ({
  OpencodeCliAdapter: jest.fn(() => mockAdapterFor('opencode')),
}));
jest.mock('./cli-adapters/pi-cli.adapter', () => ({
  PiCliAdapter: jest.fn(() => mockAdapterFor('pi')),
}));
const mockGrokCtor = jest.fn((_spawner?: unknown, _logger?: unknown) =>
  mockAdapterFor('grok'),
);
jest.mock('./cli-adapters/grok-cli.adapter', () => ({
  GrokCliAdapter: mockGrokCtor,
}));
const currentPath = (): string => process.env['PATH'] ?? '';
const mockFixPathReady = jest.fn<Promise<string>, []>(() =>
  Promise.resolve(currentPath()),
);
const mockIsShellPathPending = jest.fn<boolean, []>(() => false);
jest.mock('./cli-adapters/fix-path', () => ({
  fixPathReady: () => mockFixPathReady(),
  isShellPathPending: () => mockIsShellPathPending(),
}));

import { CliDetectionService } from './cli-detection.service';

const CHANNELS: ReadonlyArray<[CliType, AgentRoleChannel]> = [
  ['codex', 'developer-instructions'],
  ['copilot', 'task-prompt'],
  ['cursor', 'task-prompt'],
  ['antigravity', 'task-prompt'],
  ['opencode', 'task-prompt'],
  ['pi', 'task-prompt'],
  ['grok', 'task-prompt'],
];

function createAdapter(
  name: CliType,
  roleChannel: AgentRoleChannel,
): MockAdapter {
  return {
    name,
    displayName: name,
    roleChannel,
    detect: jest.fn<Promise<CliDetectionResult>, []>().mockResolvedValue({
      cli: name,
      installed: true,
      path: `/bin/${name}`,
      version: '1.0.0',
      messagingMode: 'queue',
    }),
    capabilities: jest
      .fn<CliAdapterManifest, []>()
      .mockReturnValue({
        messaging: {
          steer: { state: 'unsupported', reason: 'No live input.' },
          interrupt: { state: 'unsupported', reason: 'No interrupt.' },
          continuation: { state: 'supported' },
          resume: { state: 'supported' },
        },
        roleChannel,
        permissionModes: {},
        networkModes: {
          allow: { state: 'supported' },
          deny: { state: 'unsupported', reason: 'No sandbox.' },
        },
        limitReader: { state: 'no-reliable-source', reason: 'No reader.' },
        mcp: { state: 'unsupported', reason: 'No transport.' },
      }),
    parseOutput: jest.fn<string, [string]>((raw) => raw),
    runSdk: jest.fn<Promise<SdkHandle>, [CliCommandOptions]>()
      .mockResolvedValue({
        abort: new AbortController(), done: Promise.resolve(0),
        onOutput: () => undefined,
      }),
    listModels: jest.fn<Promise<CliModelInfo[]>, []>().mockResolvedValue([]),
  };
}

function createService(codexAdapterFactory: CodexAdapterFactory | null = {
  create: () => mockAdapterFor('codex'),
}): {
  service: CliDetectionService;
  logger: Logger;
  sentry: { captureException: jest.Mock };
  authSecrets: { getProviderKey: jest.Mock };
} {
  const logger = Object.create(Logger.prototype) as Logger;
  for (const method of ['info', 'debug', 'warn', 'error'] as const) {
    Object.defineProperty(logger, method, { value: jest.fn() });
  }
  const sentryService = Object.create(SentryService.prototype) as SentryService;
  const sentry = { captureException: jest.fn() };
  Object.defineProperty(sentryService, 'captureException', {
    value: sentry.captureException,
  });
  const authSecrets = { getProviderKey: jest.fn(async () => undefined) };
  const authSecretsService = Object.create(AuthSecretsService.prototype) as AuthSecretsService;
  Object.defineProperty(authSecretsService, 'getProviderKey', {
    value: authSecrets.getProviderKey,
  });
  const service = new CliDetectionService(
    logger,
    sentryService,
    {} as IProcessSpawner,
    authSecretsService,
    null,
    codexAdapterFactory,
  );
  return { service, logger, sentry, authSecrets };
}

describe('CliDetectionService login-shell PATH refresh', () => {
  const settle = (): Promise<void> =>
    new Promise((resolve) => setImmediate(resolve));

  /** One shared pending probe, as `fixPath` exposes it. */
  function pendingProbe(): (path: string) => void {
    let land: (path: string) => void = () => undefined;
    const probe = new Promise<string>((resolve) => {
      land = (next: string) => {
        process.env['PATH'] = next;
        mockIsShellPathPending.mockReturnValue(false);
        resolve(next);
      };
    });
    mockFixPathReady.mockImplementation(() => probe);
    mockIsShellPathPending.mockReturnValue(true);
    return (next: string) => land(next);
  }

  const originalPath = process.env['PATH'];

  beforeEach(() => {
    mockAdapters.clear();
    for (const [name, channel] of CHANNELS) {
      mockAdapters.set(name, createAdapter(name, channel));
    }
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env['PATH'] = originalPath;
    mockIsShellPathPending.mockImplementation(() => false);
    mockFixPathReady.mockImplementation(() => Promise.resolve(currentPath()));
  });

  it('drops the cached scan once when the shell PATH lands after a scan ran', async () => {
    const land = pendingProbe();
    // The scan below runs on the fallback PATH: its head start already lapsed.
    mockIsShellPathPending.mockReturnValue(false);
    const { service } = createService();
    await service.detectAll();
    const invalidate = jest.spyOn(service, 'invalidateCache');

    land(`/login-shell/bin:${currentPath()}`);
    await settle();

    expect(invalidate).toHaveBeenCalledTimes(1);
    await service.detectAll();
    expect(mockAdapterFor('codex').detect).toHaveBeenCalledTimes(2);
  });

  it('keeps the cached scan when the shell probe leaves PATH unchanged', async () => {
    const { service } = createService();
    await service.detectAll();
    const invalidate = jest.spyOn(service, 'invalidateCache');

    await settle();

    expect(invalidate).not.toHaveBeenCalled();
  });

  it('starts the first scan after the shell PATH when it lands within the head start', async () => {
    const land = pendingProbe();
    const { service } = createService();
    const invalidate = jest.spyOn(service, 'invalidateCache');
    let seenPath = '';
    mockAdapterFor('codex').detect.mockImplementation(async () => {
      seenPath = currentPath();
      return { cli: 'codex', installed: true, messagingMode: 'queue' };
    });

    const first = service.detectAll();
    // Joined while it waits: one scan, not two.
    const joined = service.detectAll();
    expect(mockAdapterFor('codex').detect).not.toHaveBeenCalled();

    land('/login-shell/bin');
    expect(await joined).toEqual(await first);

    expect(seenPath).toBe('/login-shell/bin');
    expect(invalidate).not.toHaveBeenCalled();
    await service.detectAll();
    expect(mockAdapterFor('codex').detect).toHaveBeenCalledTimes(1);
  });

  it('bounds the head start: a silent probe delays the first scan by at most 1 s', async () => {
    jest.useFakeTimers();
    pendingProbe();
    const { service } = createService();

    const first = service.detectAll();
    await jest.advanceTimersByTimeAsync(999);
    expect(mockAdapterFor('codex').detect).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    await first;

    for (const [name] of CHANNELS) {
      expect(mockAdapterFor(name).detect).toHaveBeenCalledTimes(1);
    }
    // Only the first scan waits.
    service.invalidateCache();
    const second = service.detectAll();
    expect(mockAdapterFor('codex').detect).toHaveBeenCalledTimes(2);
    await second;
  });
});

describe('CliDetectionService role stamp', () => {
  beforeEach(() => {
    mockAdapters.clear();
    mockCursorCtor.mockClear();
    mockGrokCtor.mockClear();
    for (const [name, channel] of CHANNELS) {
      mockAdapters.set(name, createAdapter(name, channel));
    }
  });

  it('reports an unavailable Codex slot when no native factory is registered', async () => {
    const { service, logger } = createService(null);
    expect(await service.getDetection('codex')).toMatchObject({ installed: false });
    await expect(service.getAdapter('codex')?.runSdk({
      task: 'work', workingDirectory: '/work',
    })).rejects.toThrow('Native Codex lane adapter factory is not registered');
    expect(logger.warn).toHaveBeenCalledWith(
      '[CliDetection] Native Codex adapter unavailable',
      expect.any(Error),
    );
  });

  it('keeps peer adapters usable and reports a native factory failure without legacy fallback', async () => {
    const failure = new Error('native composition failed');
    const { service, logger, sentry } = createService({
      create: () => { throw failure; },
    });

    expect(service.getAdapter('copilot')).toBe(mockAdapterFor('copilot'));
    expect(await service.getDetection('codex')).toMatchObject({ installed: false });
    expect(await service.listModelsForAll()).not.toHaveProperty('codex');
    await expect(service.getAdapter('codex')?.runSdk({
      task: 'work', workingDirectory: '/work',
    })).rejects.toThrow('Native Codex adapter unavailable: native composition failed');
    expect(logger.error).toHaveBeenCalledWith(
      '[CliDetection] Native Codex adapter factory failed', failure,
    );
    expect(service.getAdapter('codex')?.capabilities().limitReader).toEqual({
      state: 'no-reliable-source',
      reason: 'Native Codex adapter is unavailable.',
    });
    expect(JSON.stringify(service.getAdapter('codex')?.capabilities()))
      .not.toContain(failure.message);
    expect(sentry.captureException).toHaveBeenCalledWith(failure, {
      errorSource: 'CliDetectionService.codexAdapterFactory',
    });
  });

  it('constructs the Cursor adapter with a resolver over getProviderKey("cursor")', async () => {
    const { authSecrets } = createService();

    expect(mockCursorCtor).toHaveBeenCalledTimes(1);
    const [loggerArg, resolver] = mockCursorCtor.mock.calls[0];
    expect(loggerArg).toBeDefined();
    if (!resolver) {
      throw new Error('CursorCliAdapter was constructed without a resolver');
    }
    await resolver();
    expect(authSecrets.getProviderKey).toHaveBeenCalledWith('cursor');
  });

  it('constructs the Grok adapter with the process spawner and the logger', () => {
    createService();

    expect(mockGrokCtor).toHaveBeenCalledTimes(1);
    const [spawnerArg, loggerArg] = mockGrokCtor.mock.calls[0];
    expect(spawnerArg).toBeDefined();
    expect(loggerArg).toBeDefined();
  });

  it('checks Grok credentials in refreshCliTokens', async () => {
    const ensureTokensFresh = jest.fn(async () => true);
    Object.assign(mockAdapterFor('grok'), { ensureTokensFresh });
    const { service } = createService();

    await service.refreshCliTokens();

    expect(ensureTokensFresh).toHaveBeenCalledTimes(1);
  });

  it('stamps preamble delivery and the adapter channel on every successful detection', async () => {
    const { service } = createService();

    const results = await service.detectAll();

    expect(results).toHaveLength(CHANNELS.length);
    for (const [name, channel] of CHANNELS) {
      expect(results.find((r) => r.cli === name)).toMatchObject({
        cli: name,
        installed: true,
        path: `/bin/${name}`,
        version: '1.0.0',
        messagingMode: 'queue',
        roleDelivery: 'preamble',
        roleChannel: channel,
        manifest: mockAdapterFor(name).capabilities(),
      });
    }
  });

  it('starts peer detection while the Codex binary probe is still pending', async () => {
    let releaseCodex: ((result: CliDetectionResult) => void) | undefined;
    mockAdapterFor('codex').detect.mockImplementation(
      () => new Promise((resolve) => {
        releaseCodex = resolve;
      }),
    );
    const { service } = createService();

    const pending = service.detectAll();
    for (const [name] of CHANNELS) {
      expect(mockAdapterFor(name).detect).toHaveBeenCalledTimes(1);
    }
    if (!releaseCodex) throw new Error('Codex detection did not start');
    releaseCodex({
      cli: 'codex', installed: true, path: '/bin/codex',
      version: '0.165.0', messagingMode: 'queue',
    });

    expect((await pending).map((row) => row.cli)).toEqual(CHANNELS.map(([name]) => name));
  });

  it('stamps the error-branch row when an adapter detect() throws', async () => {
    mockAdapterFor('codex').detect.mockRejectedValue(new Error('boom'));
    const { service, sentry } = createService();

    const codex = await service.getDetection('codex');

    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    expect(codex).toMatchObject({
      cli: 'codex',
      installed: false,
      messagingMode: 'queue',
      roleDelivery: 'preamble',
      roleChannel: 'developer-instructions',
      manifest: mockAdapterFor('codex').capabilities(),
    });
  });

  it('serves stamped rows from the cache without re-detecting', async () => {
    mockAdapterFor('pi').detect.mockRejectedValue(new Error('boom'));
    const { service } = createService();

    const first = await service.detectAll();
    const second = await service.detectAll();

    expect(second).toEqual(first);
    for (const [name] of CHANNELS) {
      expect(mockAdapterFor(name).detect).toHaveBeenCalledTimes(1);
    }
    for (const row of second) {
      expect(row.roleDelivery).toBe('preamble');
      expect(row.roleChannel).toBe(mockAdapterFor(row.cli).roleChannel);
    }
  });

  it('refresh() joins a current in-flight scan instead of starting a second one', async () => {
    let releaseCodex: ((result: CliDetectionResult) => void) | undefined;
    mockAdapterFor('codex').detect.mockImplementationOnce(
      () => new Promise((resolve) => { releaseCodex = resolve; }),
    );
    const { service } = createService();
    const first = service.detectAll();

    const joined = service.refresh();
    for (const [name] of CHANNELS) {
      expect(mockAdapterFor(name).detect).toHaveBeenCalledTimes(1);
    }

    if (!releaseCodex) throw new Error('Codex detection did not start');
    releaseCodex({ cli: 'codex', installed: true, messagingMode: 'queue' });
    expect(await joined).toEqual(await first);

    // The joined scan was current, so its result is cached.
    await service.detectAll();
    for (const [name] of CHANNELS) {
      expect(mockAdapterFor(name).detect).toHaveBeenCalledTimes(1);
    }
    // With no scan in flight, refresh() re-detects.
    await service.refresh();
    for (const [name] of CHANNELS) {
      expect(mockAdapterFor(name).detect).toHaveBeenCalledTimes(2);
    }
  });

  it('refresh() does not join a scan older than 15 s, so a stuck adapter cannot hold it', async () => {
    let releaseCodex: ((result: CliDetectionResult) => void) | undefined;
    mockAdapterFor('codex').detect.mockImplementationOnce(
      () => new Promise((resolve) => { releaseCodex = resolve; }),
    );
    const clock = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    try {
      const { service } = createService();
      const stuck = service.detectAll();

      clock.mockReturnValue(1_000_000 + 15_000);
      const fresh = service.refresh();
      for (const [name] of CHANNELS) {
        expect(mockAdapterFor(name).detect).toHaveBeenCalledTimes(2);
      }
      await fresh;

      if (!releaseCodex) throw new Error('Codex detection did not start');
      releaseCodex({ cli: 'codex', installed: true, messagingMode: 'queue' });
      await stuck;
    } finally {
      clock.mockRestore();
    }
  });

  it('does not join or cache a scan that started before invalidateCache()', async () => {
    let releaseCodex: ((result: CliDetectionResult) => void) | undefined;
    mockAdapterFor('codex').detect.mockImplementationOnce(
      () => new Promise((resolve) => { releaseCodex = resolve; }),
    );
    const { service } = createService();
    const stale = service.detectAll();

    service.invalidateCache();
    const fresh = service.refresh();
    for (const [name] of CHANNELS) {
      expect(mockAdapterFor(name).detect).toHaveBeenCalledTimes(2);
    }

    if (!releaseCodex) throw new Error('Codex detection did not start');
    releaseCodex({ cli: 'codex', installed: true, messagingMode: 'queue' });
    await stale;
    await fresh;

    // The fresh scan is cached; the stale one did not overwrite it.
    await service.detectAll();
    for (const [name] of CHANNELS) {
      expect(mockAdapterFor(name).detect).toHaveBeenCalledTimes(2);
    }
  });

  it('deduplicates model listing and recomputes after invalidation', async () => {
    const { service } = createService();
    await Promise.all([service.listModelsForAll(), service.listModelsForAll()]);
    for (const [name] of CHANNELS) {
      expect(mockAdapterFor(name).listModels).toHaveBeenCalledTimes(1);
    }
    await service.listModelsForAll();
    expect(mockAdapterFor('codex').listModels).toHaveBeenCalledTimes(1);
    service.invalidateCache();
    await service.listModelsForAll();
    expect(mockAdapterFor('codex').listModels).toHaveBeenCalledTimes(2);
  });

  it('does not cache a model map in which a CLI failed, so the next call retries it', async () => {
    const { service } = createService();
    mockAdapterFor('codex').listModels.mockRejectedValueOnce(
      new Error('codex catalog unavailable'),
    );
    expect(await service.listModelsForAll()).not.toHaveProperty('codex');
    expect(await service.listModelsForAll()).toHaveProperty('codex');
    expect(mockAdapterFor('codex').listModels).toHaveBeenCalledTimes(2);
    // A read with no failure is cached as before.
    await service.listModelsForAll();
    expect(mockAdapterFor('codex').listModels).toHaveBeenCalledTimes(2);
  });
});

describe('CliDetectionService named detection', () => {
  beforeEach(() => {
    mockAdapters.clear();
    for (const [name, channel] of CHANNELS) mockAdapters.set(name, createAdapter(name, channel));
    mockIsShellPathPending.mockReturnValue(false);
  });

  it('re-probes a not-installed CLI but serves an installed result from cache', async () => {
    const { service } = createService();
    mockAdapterFor('codex').detect.mockResolvedValueOnce({
      cli: 'codex', installed: false, messagingMode: 'none',
    });
    expect((await service.getDetection('codex'))?.installed).toBe(false);
    expect((await service.getDetection('codex'))?.installed).toBe(true);
    expect((await service.getDetection('codex'))?.installed).toBe(true);
    expect(mockAdapterFor('codex').detect).toHaveBeenCalledTimes(2);
  });

  it('serves stale installed detection immediately and starts one background refresh', async () => {
    const { service } = createService();
    await service.getDetection('codex');
    let release: ((value: CliDetectionResult) => void) | undefined;
    mockAdapterFor('codex').detect.mockImplementationOnce(() => new Promise((resolve) => {
      release = resolve;
    }));
    service.invalidateCache();
    const [first, second] = await Promise.all([
      service.getDetection('codex'), service.getDetection('codex'),
    ]);
    expect(first?.version).toBe('1.0.0');
    expect(second?.version).toBe('1.0.0');
    expect(mockAdapterFor('codex').detect).toHaveBeenCalledTimes(2);
    if (!release) throw new Error('Background probe did not start');
    release({ cli: 'codex', installed: true, version: '2.0.0', messagingMode: 'queue' });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect((await service.getDetection('codex'))?.version).toBe('2.0.0');
    expect(mockAdapterFor('codex').detect).toHaveBeenCalledTimes(2);
  });

  it('does not let a detached probe repopulate a dropped entry', async () => {
    const { service } = createService();
    let release: ((value: CliDetectionResult) => void) | undefined;
    mockAdapterFor('codex').detect.mockImplementationOnce(() => new Promise((resolve) => {
      release = resolve;
    }));
    const first = service.getDetection('codex');
    service.dropDetection('codex');
    if (!release) throw new Error('First probe did not start');
    release({ cli: 'codex', installed: true, version: 'old', messagingMode: 'queue' });
    await first;
    expect((await service.getDetection('codex'))?.version).toBe('1.0.0');
    expect(mockAdapterFor('codex').detect).toHaveBeenCalledTimes(2);
  });

  it('joins concurrent first probes for one CLI', async () => {
    const { service } = createService();
    const [first, second] = await Promise.all([
      service.getDetection('codex'), service.getDetection('codex'),
    ]);
    expect(first).toEqual(second);
    expect(mockAdapterFor('codex').detect).toHaveBeenCalledTimes(1);
  });

  it('returns undefined for an unregistered CLI', async () => {
    const { service } = createService();
    expect(await service.getDetection('unregistered' as CliType)).toBeUndefined();
  });

  it('returns a completed Codex result during a stuck refresh and after invalidation', async () => {
    const { service } = createService();
    await service.detectAll();
    mockAdapterFor('grok').detect.mockImplementation(() => new Promise(() => undefined));
    const refresh = service.refresh();
    expect((await service.getDetection('codex'))?.installed).toBe(true);
    service.invalidateCache();
    expect((await service.getDetection('codex'))?.installed).toBe(true);
    void refresh;
  });

  it('resolves a first Codex probe while another adapter is stuck', async () => {
    const { service } = createService();
    mockAdapterFor('grok').detect.mockImplementation(() => new Promise(() => undefined));
    void service.detectAll();
    expect((await service.getDetection('codex'))?.cli).toBe('codex');
    expect(mockAdapterFor('codex').detect).toHaveBeenCalledTimes(1);
  });

  it('drops one completed result and probes only that CLI on next named detection', async () => {
    const { service } = createService();
    await service.detectAll();
    service.dropDetection('codex');
    await service.getDetection('codex');
    expect(mockAdapterFor('codex').detect).toHaveBeenCalledTimes(2);
    expect(mockAdapterFor('grok').detect).toHaveBeenCalledTimes(1);
  });

  it('logs a slow probe with its outcome', async () => {
    const clock = jest.spyOn(performance, 'now');
    clock.mockReturnValueOnce(0).mockReturnValueOnce(1002);
    try {
      const { service, logger } = createService();
      await service.getDetection('codex');
      expect(logger.warn).toHaveBeenCalledWith('[CliDetection] slow probe', {
        cli: 'codex', durationMs: 1002, outcome: 'installed',
      });
    } finally {
      clock.mockRestore();
    }
  });
});
