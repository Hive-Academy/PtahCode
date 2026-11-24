/**
 * code-execution-mcp.service — unit specs.
 *
 * `CodeExecutionMCP` is a thin orchestrator that wires HTTP server lifecycle
 * + MCP JSON-RPC dispatch together, delegating the actual work to helpers in
 * `./mcp-handlers`. The behaviours this spec locks down are:
 *
 *   1. MCP tool registration — constructor wiring:
 *        - builds `PtahAPI` eagerly via the injected `PtahAPIBuilder`,
 *        - resolves `WebviewManager` lazily only when registered in the
 *          container (present in VS Code, absent in Electron),
 *        - detects `hasIDECapabilities` via `container.isRegistered`.
 *
 *   2. Request dispatch — `start()` / `stop()`:
 *        - `start()` reads the configured port from `IWorkspaceProvider`,
 *          delegates to `startHttpServer`, stores the returned server + port
 *          for later shutdown, and wires `onMCPRequest` to `handleMCPRequest`
 *          with the correct context (api, permissions, webview, flags,
 *          disabled namespaces).
 *        - Calling `start()` twice returns the existing port without
 *          re-spinning the server.
 *        - `stop()` tears the server down via `stopHttpServer` and clears
 *          internal state.
 *        - `ensureRegisteredForSubagents()`, `retainRoot()` and
 *          `releaseRoot()` are readiness answers that write no MCP config
 *          file (TASK_2026_979_9e1f, decision 10; section 2).
 *        - `setToolResultCallback` / `clearToolResultCallback` forward the
 *          callback to the dispatch context on the NEXT `start()`.
 *
 *   3. Error propagation — MCP request dispatch surfaces handler errors via
 *      the mocked `handleMCPRequest` without swallowing them, and `dispose()`
 *      surfaces `stop()` failures to the logger instead of silently eating
 *      them (the regression that motivated `disposeAsync`).
 *
 * External surfaces are mocked:
 *   - `./mcp-handlers` — HTTP + protocol helpers replaced with `jest.fn()`s.
 *   - `fs` — mocked so section 2 can prove no config file is read or written.
 *   - `tsyringe.container` — registration checks controlled per-test via
 *     `registerInstance` / `clearInstances` so both VS Code and Electron
 *     wiring paths are exercised.
 */

import 'reflect-metadata';

// `@ptah-extension/vscode-core` transitively imports `vscode`, which blows up
// jest's parser in a node env. Stub the surface we touch (TOKENS) BEFORE any
// static import so the SUT sees the mocked module. Mirrors the pattern used
// by `output-validation.service.spec.ts` in agent-generation.
jest.mock('@ptah-extension/vscode-core', () => ({
  TOKENS: {
    PTAH_API_BUILDER: Symbol.for('PtahAPIBuilder'),
    LOGGER: Symbol.for('Logger'),
    PERMISSION_PROMPT_SERVICE: Symbol.for('PermissionPromptService'),
    WEBVIEW_MANAGER: Symbol.for('WebviewManager'),
  },
  Logger: class {},
  WebviewManager: class {},
  FileSystemManager: class {},
}));

// Replace ptah-api-builder.service at the module boundary — its real impl
// transitively loads workspace-intelligence + agent-sdk which in turn pull in
// the `vscode` ambient module.  We only need the IDE_CAPABILITIES_TOKEN
// Symbol (read by the SUT constructor) and the class as a type.
jest.mock('../ptah-api-builder.service', () => ({
  IDE_CAPABILITIES_TOKEN: Symbol.for('IDECapabilities'),
  PtahAPIBuilder: class PtahAPIBuilderStub {},
}));

// Dispose must kill the live `run_check` trees (TASK_2026_614 Task 10.2). The
// kill itself is pinned in run-check.tool.spec and stdio-mcp-server.service
// .spec; here only the call and its fail-open handling are observed.
jest.mock('../mcp-core/run-check.tool', () => ({
  ...jest.requireActual('../mcp-core/run-check.tool'),
  killRunningChecks: jest.fn(async () => undefined),
}));

// Replace the permission-prompt service for the same reason: it transitively
// pulls in webview/agent-sdk types we don't want to load here.
jest.mock('../../permission/permission-prompt.service', () => ({
  PermissionPromptService: class PermissionPromptServiceStub {},
}));

jest.mock('../mcp-core', () => ({
  handleMCPRequest: jest.fn(),
}));

jest.mock('./http-server.handler', () => ({
  startHttpServer: jest.fn(),
  stopHttpServer: jest.fn(),
  getConfiguredPort: jest.fn(),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

// `withMcpConfigLock` is mocked only so section 2 can assert it is never
// taken: the SUT writes no MCP config file. Everything else is REAL.
jest.mock('@ptah-extension/harness-sync', () => {
  const actual = jest.requireActual<
    typeof import('@ptah-extension/harness-sync')
  >('@ptah-extension/harness-sync');
  return {
    ...actual,
    withMcpConfigLock: jest.fn(
      async (_configPath: string, task: () => Promise<unknown>) => task(),
    ),
  };
});

import * as http from 'http';
import { EventEmitter } from 'node:events';
import * as fs from 'fs';
import * as path from 'path';
import { container } from 'tsyringe';
import { TOKENS } from '@ptah-extension/vscode-core';
import type { Logger, WebviewManager } from '@ptah-extension/vscode-core';
import type {
  IArtifactStore,
  IMcpGateway,
  IStateStorage,
  IWorkspaceProvider,
} from '@ptah-extension/platform-core';
import {
  createMockStateStorage,
  createMockWorkspaceProvider,
} from '@ptah-extension/platform-core/testing';
import {
  createMockLogger,
  type MockLogger,
} from '@ptah-extension/shared/testing';

// Import AFTER jest.mock so the SUT receives the mocked module.
import { CodeExecutionMCP } from './http-mcp-server.service';
import type { ArtifactNotification } from '../mcp-core/artifact-tool-handlers';
import { IDE_CAPABILITIES_TOKEN } from '../ptah-api-builder.service';
import type { PtahAPIBuilder } from '../ptah-api-builder.service';
import type { PermissionPromptService } from '../../permission/permission-prompt.service';
import type { PtahAPI, MCPRequest, MCPResponse } from '../types';
import { handleMCPRequest as handleMCPRequestMock } from '../mcp-core';
import { killRunningChecks } from '../mcp-core/run-check.tool';
import { withMcpConfigLock as withMcpConfigLockMock } from '@ptah-extension/harness-sync';
import {
  startHttpServer as startHttpServerMock,
  stopHttpServer as stopHttpServerMock,
  getConfiguredPort as getConfiguredPortMock,
} from './http-server.handler';

// ---- Local test helpers --------------------------------------------------

function asLogger(mock: MockLogger): Logger {
  return mock as unknown as Logger;
}

function buildApi(): PtahAPI {
  return {
    help: jest.fn().mockResolvedValue('help'),
  } as unknown as PtahAPI;
}

function buildApiBuilder(api: PtahAPI): jest.Mocked<PtahAPIBuilder> {
  return {
    build: jest.fn(() => api),
    hasSymbolAndMemoryLayer: jest.fn(() => false),
  } as unknown as jest.Mocked<PtahAPIBuilder>;
}

function buildPermissionPromptService(): jest.Mocked<PermissionPromptService> {
  return {
    requestApproval: jest.fn(),
  } as unknown as jest.Mocked<PermissionPromptService>;
}

function buildWebviewManager(): jest.Mocked<WebviewManager> {
  return {
    postMessage: jest.fn(),
  } as unknown as jest.Mocked<WebviewManager>;
}

function makeFakeServer(): http.Server {
  // Protocol handlers never call anything on this object — it's opaque to
  // the SUT; stopHttpServer is mocked. A plain Record is enough.
  return {} as unknown as http.Server;
}

// Typed aliases for the mocked helpers — avoids `as any` at every callsite.
const startHttpServer = startHttpServerMock as jest.MockedFunction<
  typeof startHttpServerMock
>;
const stopHttpServer = stopHttpServerMock as jest.MockedFunction<
  typeof stopHttpServerMock
>;
const getConfiguredPort = getConfiguredPortMock as jest.MockedFunction<
  typeof getConfiguredPortMock
>;
const handleMCPRequest = handleMCPRequestMock as jest.MockedFunction<
  typeof handleMCPRequestMock
>;

const fsExistsSyncMock = fs.existsSync as jest.MockedFunction<
  typeof fs.existsSync
>;
const fsReadFileSyncMock = fs.readFileSync as jest.MockedFunction<
  typeof fs.readFileSync
>;
const fsWriteFileSyncMock = fs.writeFileSync as jest.MockedFunction<
  typeof fs.writeFileSync
>;

interface Fixture {
  service: CodeExecutionMCP;
  apiBuilder: jest.Mocked<PtahAPIBuilder>;
  api: PtahAPI;
  logger: MockLogger;
  workspaceState: ReturnType<typeof createMockStateStorage>;
  workspaceProvider: ReturnType<typeof createMockWorkspaceProvider>;
  permissionPromptService: jest.Mocked<PermissionPromptService>;
}

interface BuildOptions {
  artifactStore?: IArtifactStore;
  notifyArtifactPublished?: ArtifactNotification;
  registerWebview?: WebviewManager | false;
  registerIdeCapabilities?: boolean;
  configOverrides?: Record<string, unknown>;
  folders?: string[];
  globalState?: IStateStorage;
  gateway?: IMcpGateway;
}

function build(opts: BuildOptions = {}): Fixture {
  container.clearInstances();
  container.reset();

  const api = buildApi();
  const apiBuilder = buildApiBuilder(api);
  const logger = createMockLogger();
  const workspaceState = createMockStateStorage();
  const workspaceProvider = createMockWorkspaceProvider({
    folders: opts.folders,
    config: opts.configOverrides,
  });
  const permissionPromptService = buildPermissionPromptService();

  const webviewManager: WebviewManager | undefined = opts.registerWebview
    ? (opts.registerWebview as WebviewManager)
    : undefined;
  const ideCapabilities = opts.registerIdeCapabilities ? {} : undefined;
  if (webviewManager) {
    container.registerInstance(TOKENS.WEBVIEW_MANAGER, webviewManager);
  }
  if (ideCapabilities) {
    container.registerInstance(IDE_CAPABILITIES_TOKEN, ideCapabilities);
  }

  const service = new CodeExecutionMCP(
    apiBuilder,
    asLogger(logger),
    workspaceState as unknown as IStateStorage,
    workspaceProvider as unknown as IWorkspaceProvider,
    permissionPromptService,
    webviewManager,
    ideCapabilities as ConstructorParameters<typeof CodeExecutionMCP>[6],
    // No CLI detector: the retired-entry sweep touches no file without one.
    undefined,
    undefined,
    opts.artifactStore,
    opts.notifyArtifactPublished,
    undefined,
    opts.globalState,
    undefined,
    undefined,
    opts.gateway,
  );

  return {
    service,
    apiBuilder,
    api,
    logger,
    workspaceState,
    workspaceProvider,
    permissionPromptService,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Sensible defaults — individual tests override as needed.
  getConfiguredPort.mockReturnValue(51820);
  startHttpServer.mockResolvedValue({
    server: makeFakeServer(),
    port: 51820,
  });
  stopHttpServer.mockResolvedValue(undefined);
  handleMCPRequest.mockResolvedValue({
    jsonrpc: '2.0',
    id: 1,
    result: {},
  });
  fsExistsSyncMock.mockReturnValue(false);
  fsReadFileSyncMock.mockReturnValue('{}');
  fsWriteFileSyncMock.mockReturnValue(undefined);
});

afterEach(() => {
  container.clearInstances();
  container.reset();
});

// ===========================================================================
// 1. MCP tool registration — constructor wiring
// ===========================================================================

describe('CodeExecutionMCP — construction / tool registration', () => {
  it('passes Electron artifact ports to the HTTP dispatcher', async () => {
    const artifactStore: IArtifactStore = {
      publish: jest.fn(),
      list: jest.fn(),
      readBytes: jest.fn(),
    };
    const notifyArtifactPublished: ArtifactNotification = jest.fn(
      async () => undefined,
    );
    const { service } = build({ artifactStore, notifyArtifactPublished });
    await service.start();

    const probe: MCPRequest = { jsonrpc: '2.0', id: 10, method: 'tools/list' };
    await startHttpServer.mock.calls[0][0].onMCPRequest(probe);
    expect(handleMCPRequest).toHaveBeenCalledWith(
      probe,
      expect.objectContaining({ artifactStore, notifyArtifactPublished }),
    );
  });

  it('builds the ptah API eagerly via the injected PtahAPIBuilder', () => {
    const { apiBuilder } = build();
    expect(apiBuilder.build).toHaveBeenCalledTimes(1);
  });

  it('resolves WebviewManager when registered in the container (VS Code host)', async () => {
    const webview = buildWebviewManager();
    const { service } = build({ registerWebview: webview });
    await service.start();

    // Wire-through assertion — the dispatch closure receives the same webview.
    const ctxProbe: MCPRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    };
    await (
      startHttpServer.mock.calls[0][0].onMCPRequest as (
        r: MCPRequest,
      ) => Promise<MCPResponse>
    )(ctxProbe);

    expect(handleMCPRequest).toHaveBeenCalledWith(
      ctxProbe,
      expect.objectContaining({ webviewManager: webview }),
    );
  });

  it('leaves WebviewManager undefined when not registered (Electron host)', async () => {
    const { service } = build({ registerWebview: false });
    await service.start();

    const probe: MCPRequest = { jsonrpc: '2.0', id: 9, method: 'tools/list' };
    await (
      startHttpServer.mock.calls[0][0].onMCPRequest as (
        r: MCPRequest,
      ) => Promise<MCPResponse>
    )(probe);

    expect(handleMCPRequest).toHaveBeenCalledWith(
      probe,
      expect.objectContaining({ webviewManager: undefined }),
    );
  });

  it('flags hasIDECapabilities=true when IDE_CAPABILITIES_TOKEN is registered', async () => {
    const { service } = build({ registerIdeCapabilities: true });
    await service.start();

    const probe: MCPRequest = { jsonrpc: '2.0', id: 2, method: 'tools/list' };
    await (
      startHttpServer.mock.calls[0][0].onMCPRequest as (
        r: MCPRequest,
      ) => Promise<MCPResponse>
    )(probe);

    expect(handleMCPRequest).toHaveBeenCalledWith(
      probe,
      expect.objectContaining({ hasIDECapabilities: true }),
    );
  });

  it('flags hasIDECapabilities=false when IDE_CAPABILITIES_TOKEN is absent (Electron)', async () => {
    const { service } = build({ registerIdeCapabilities: false });
    await service.start();

    const probe: MCPRequest = { jsonrpc: '2.0', id: 3, method: 'tools/list' };
    await (
      startHttpServer.mock.calls[0][0].onMCPRequest as (
        r: MCPRequest,
      ) => Promise<MCPResponse>
    )(probe);

    expect(handleMCPRequest).toHaveBeenCalledWith(
      probe,
      expect.objectContaining({ hasIDECapabilities: false }),
    );
  });
});

// ===========================================================================
// 2. Request dispatch — start/stop lifecycle and MCP routing
// ===========================================================================

describe('CodeExecutionMCP — start/stop lifecycle', () => {
  it('reads configured port from workspaceProvider and returns the actual listening port', async () => {
    getConfiguredPort.mockReturnValue(60001);
    startHttpServer.mockResolvedValue({
      server: makeFakeServer(),
      port: 60002, // OS-assigned after EACCES retry
    });

    const { service, workspaceProvider } = build();
    const port = await service.start();

    expect(getConfiguredPort).toHaveBeenCalledWith(workspaceProvider);
    expect(startHttpServer).toHaveBeenCalledWith(
      expect.objectContaining({ port: 60001 }),
    );
    expect(port).toBe(60002);
    expect(service.getPort()).toBe(60002);
  });

  it('returns existing port and warns when start() is invoked twice', async () => {
    const { service, logger } = build();
    const first = await service.start();
    const second = await service.start();

    expect(first).toBe(second);
    expect(startHttpServer).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('already started'),
      'CodeExecutionMCP',
    );
  });

  it('routes incoming MCP requests to handleMCPRequest with the built PtahAPI', async () => {
    const { service, api, permissionPromptService } = build();
    await service.start();

    const onMCPRequest = startHttpServer.mock.calls[0][0].onMCPRequest;
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: 42,
      method: 'tools/call',
      params: { name: 'ptah_workspace_analyze' },
    };
    await onMCPRequest(request);

    expect(handleMCPRequest).toHaveBeenCalledWith(
      request,
      expect.objectContaining({
        ptahAPI: api,
        permissionPromptService,
      }),
    );
  });

  it('forwards the disabledMcpNamespaces config into the dispatch context', async () => {
    const { service } = build({
      configOverrides: {
        'ptah.agentOrchestration.disabledMcpNamespaces': ['browser', 'git'],
      },
    });
    await service.start();

    const onMCPRequest = startHttpServer.mock.calls[0][0].onMCPRequest;
    await onMCPRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' });

    expect(handleMCPRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ disabledMcpNamespaces: ['browser', 'git'] }),
    );
  });

  it('defaults disabledMcpNamespaces to [] when the config key is unset', async () => {
    const { service } = build();
    await service.start();

    const onMCPRequest = startHttpServer.mock.calls[0][0].onMCPRequest;
    await onMCPRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' });

    expect(handleMCPRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ disabledMcpNamespaces: [] }),
    );
  });

  it('stop() delegates to stopHttpServer and clears internal port/server', async () => {
    const fakeServer = makeFakeServer();
    startHttpServer.mockResolvedValue({ server: fakeServer, port: 51820 });

    const { service, workspaceState, logger } = build();
    await service.start();
    expect(service.getPort()).toBe(51820);

    await service.stop();

    expect(stopHttpServer).toHaveBeenCalledWith(
      fakeServer,
      workspaceState,
      asLogger(logger),
    );
    expect(service.getPort()).toBeNull();
  });

  it('stop() is safe to call before start() (no server to tear down)', async () => {
    const { service } = build();
    await expect(service.stop()).resolves.toBeUndefined();
    // stopHttpServer is still invoked with null — the helper guards internally.
    expect(stopHttpServer).toHaveBeenCalledWith(
      null,
      expect.anything(),
      expect.anything(),
    );
  });

  it('forwards tool result callbacks set BEFORE start() into the dispatch context', async () => {
    const { service } = build();
    const cb = jest.fn();
    service.setToolResultCallback(cb);

    await service.start();
    const onMCPRequest = startHttpServer.mock.calls[0][0].onMCPRequest;
    await onMCPRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' });

    expect(handleMCPRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ onToolResult: cb }),
    );
  });

  it('clearToolResultCallback() clears the callback on subsequent dispatches', async () => {
    const { service } = build();
    const cb = jest.fn();
    service.setToolResultCallback(cb);
    await service.start();

    service.clearToolResultCallback();

    const onMCPRequest = startHttpServer.mock.calls[0][0].onMCPRequest;
    await onMCPRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' });

    expect(handleMCPRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ onToolResult: undefined }),
    );
  });
});
// ===========================================================================
// 2. Readiness answers — no MCP config file is written (TASK_2026_979_9e1f)
// ===========================================================================

/** Let queued operations and their microtasks run. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

/** Every path the SUT wrote, read or tested through the mocked `fs`. */
function fsPathsTouched(): string[] {
  return [
    ...fsWriteFileSyncMock.mock.calls,
    ...fsReadFileSyncMock.mock.calls,
    ...fsExistsSyncMock.mock.calls,
  ].map((call) => String(call[0]));
}

describe('CodeExecutionMCP — ensureRegisteredForSubagents (readiness only)', () => {
  it('reports not-started before start(), and after stop()', async () => {
    const { service } = build({ folders: ['/ws'] });
    await expect(service.ensureRegisteredForSubagents()).resolves.toEqual({
      registered: false,
      reason: 'not-started',
    });

    await service.start();
    await service.stop();
    await expect(service.ensureRegisteredForSubagents()).resolves.toEqual({
      registered: false,
      reason: 'not-started',
    });
  });

  it('reports registered when the server is up, and writes no config file', async () => {
    const { service } = build({ folders: ['/wsA', '/wsB'] });
    await service.start();

    await expect(service.ensureRegisteredForSubagents()).resolves.toEqual({
      registered: true,
    });
    await expect(service.ensureRegisteredForSubagents()).resolves.toEqual({
      registered: true,
    });

    expect(fsWriteFileSyncMock).not.toHaveBeenCalled();
    expect(withMcpConfigLockMock).not.toHaveBeenCalled();
    expect(fsPathsTouched().some((p) => p.endsWith('.mcp.json'))).toBe(false);
  });

  it('reports registered with no folder open (the session gets ptah at spawn)', async () => {
    const { service } = build({ folders: [] });
    await service.start();

    await expect(service.ensureRegisteredForSubagents()).resolves.toEqual({
      registered: true,
    });
    expect(fsWriteFileSyncMock).not.toHaveBeenCalled();
  });

  it('leaves an existing .mcp.json ptah entry exactly as it is (D-U5 Option 1)', async () => {
    const before = JSON.stringify({
      mcpServers: {
        ptah: { type: 'http', url: 'http://localhost:51820/auth/x/workspace/y' },
      },
    });
    fsExistsSyncMock.mockReturnValue(true);
    fsReadFileSyncMock.mockReturnValue(before);
    const { service, logger } = build({ folders: ['/ws'] });
    await service.start();

    await service.ensureRegisteredForSubagents();
    await service.stop();

    expect(fsWriteFileSyncMock).not.toHaveBeenCalled();
    expect(fsPathsTouched().some((p) => p.endsWith('.mcp.json'))).toBe(false);
    expect(logger.info).not.toHaveBeenCalledWith(
      expect.stringContaining('Registered ptah'),
      expect.anything(),
    );
  });

  it('a workspace-folder change writes nothing, before or after a chat start', async () => {
    const { service, workspaceProvider } = build({ folders: ['/wsA'] });
    await service.start();

    workspaceProvider.__state.setFolders(['/wsA', '/wsB']);
    await settle();
    await service.ensureRegisteredForSubagents();
    workspaceProvider.__state.setFolders(['/wsB']);
    await settle();
    workspaceProvider.__state.setFolders([]);
    await settle();

    expect(fsWriteFileSyncMock).not.toHaveBeenCalled();
    expect(withMcpConfigLockMock).not.toHaveBeenCalled();
  });

  it('does not wait on a stuck sweep past the chat deadline, and still reports registered', async () => {
    jest.useFakeTimers();
    try {
      const { service } = build({ folders: ['/ws'] });
      await service.start();
      // A queued operation that never finishes holds the queue.
      let release: () => void = () => undefined;
      const blocker = new Promise<void>((resolve) => {
        release = resolve;
      });
      void service['enqueueMcpOp'](() => blocker);

      const answer = service.ensureRegisteredForSubagents();
      await jest.advanceTimersByTimeAsync(3000);
      await expect(answer).resolves.toEqual({ registered: true });
      release();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('CodeExecutionMCP — retainRoot / releaseRoot (readiness only)', () => {
  it('refuses a relative or empty root', async () => {
    const { service } = build({ folders: ['/ws'] });
    await service.start();

    await expect(service.retainRoot('')).resolves.toEqual({
      registered: false,
      reason: 'invalid-root',
    });
    await expect(service.retainRoot('relative/dir')).resolves.toEqual({
      registered: false,
      reason: 'invalid-root',
    });
  });

  it('reports not-started before start() and after stop()', async () => {
    const root = path.resolve('/wt');
    const { service } = build({ folders: ['/ws'] });
    await expect(service.retainRoot(root)).resolves.toEqual({
      registered: false,
      reason: 'not-started',
    });
    await service.start();
    await service.stop();
    await expect(service.retainRoot(root)).resolves.toEqual({
      registered: false,
      reason: 'not-started',
    });
  });

  it('reports registered for a root outside the open folders and writes nothing', async () => {
    const root = path.resolve('/child-worktree');
    const { service } = build({ folders: ['/ws'] });
    await service.start();

    await expect(service.retainRoot(root)).resolves.toEqual({
      registered: true,
    });
    await expect(service.releaseRoot(root)).resolves.toBeUndefined();
    await expect(service.releaseRoot(root)).resolves.toBeUndefined();

    expect(fsWriteFileSyncMock).not.toHaveBeenCalled();
    expect(withMcpConfigLockMock).not.toHaveBeenCalled();
    expect(fsPathsTouched()).toEqual([]);
  });
});

// ===========================================================================
// 3. Error propagation — dispatch + dispose surfaces
// ===========================================================================

describe('CodeExecutionMCP — error propagation', () => {
  it('surfaces MCP handler errors up to the HTTP dispatch boundary (does not swallow)', async () => {
    const boom = new Error('handler exploded');
    handleMCPRequest.mockRejectedValue(boom);

    const { service } = build();
    await service.start();
    const onMCPRequest = startHttpServer.mock.calls[0][0].onMCPRequest;

    await expect(
      onMCPRequest({ jsonrpc: '2.0', id: 1, method: 'tools/call' }),
    ).rejects.toThrow('handler exploded');
  });

  it('propagates startHttpServer rejections out of start()', async () => {
    startHttpServer.mockRejectedValue(new Error('port taken'));
    const { service } = build();
    await expect(service.start()).rejects.toThrow('port taken');
    expect(service.getPort()).toBeNull();
  });

  it('disposeAsync() kills the live checks before the server stops', async () => {
    const { service } = build();
    await service.start();
    const kill = jest.mocked(killRunningChecks);
    kill.mockClear();
    stopHttpServer.mockClear();
    stopHttpServer.mockResolvedValue(undefined);

    await service.disposeAsync();

    expect(kill).toHaveBeenCalledTimes(1);
    expect(stopHttpServer).toHaveBeenCalledTimes(1);
    expect(kill.mock.invocationCallOrder[0]).toBeLessThan(
      stopHttpServer.mock.invocationCallOrder[0],
    );
  });

  it('disposeAsync() warns once and still stops when the check kill fails', async () => {
    const { service, logger } = build();
    await service.start();
    jest
      .mocked(killRunningChecks)
      .mockRejectedValueOnce(new Error('taskkill missing'));
    stopHttpServer.mockClear();
    stopHttpServer.mockResolvedValue(undefined);

    await expect(service.disposeAsync()).resolves.toBeUndefined();

    const warns = logger.warn.mock.calls.filter(
      ([message]) =>
        message === '[CodeExecutionMCP] Killing running checks failed',
    );
    expect(warns).toEqual([
      [
        '[CodeExecutionMCP] Killing running checks failed',
        { reason: 'taskkill missing' },
      ],
    ]);
    expect(stopHttpServer).toHaveBeenCalledTimes(1);
  });

  it('disposeAsync() propagates stop() failures to the caller', async () => {
    const { service } = build();
    await service.start();
    stopHttpServer.mockRejectedValue(new Error('shutdown failed'));

    await expect(service.disposeAsync()).rejects.toThrow('shutdown failed');
  });

  it('dispose() logs teardown errors instead of throwing synchronously', async () => {
    const { service, logger } = build();
    await service.start();
    stopHttpServer.mockRejectedValue(new Error('shutdown failed'));

    // Must not throw even though the underlying stop() rejects.
    expect(() => service.dispose()).not.toThrow();

    // Await microtask flush so the .catch handler runs.
    await new Promise((resolve) => setImmediate(resolve));

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error during dispose'),
      expect.any(Error),
    );
  });
});

describe('CodeExecutionMCP — MCP gateway wiring', () => {
  function buildGateway(): {
    gateway: jest.Mocked<IMcpGateway>;
    fireToolsChanged: () => void;
    unsubscribe: jest.Mock;
  } {
    let listener: (() => void) | undefined;
    const unsubscribe = jest.fn();
    const gateway = {
      registerHostToolNames: jest.fn(),
      isGatewayTool: jest.fn(() => false),
      listTools: jest.fn(async () => []),
      callTool: jest.fn(),
      status: jest.fn(() => []),
      servedFileServerNames: jest.fn(async () => []),
      onToolsChanged: jest.fn((l: () => void) => {
        listener = l;
        return { dispose: unsubscribe };
      }),
      refresh: jest.fn(async () => undefined),
      dispose: jest.fn(),
    } as unknown as jest.Mocked<IMcpGateway>;
    return {
      gateway,
      fireToolsChanged: () => listener?.(),
      unsubscribe,
    };
  }

  it('registers exactly the buildToolDefinitions names at start', async () => {
    const { buildToolDefinitions } = jest.requireActual<
      typeof import('../mcp-core/effective-tool-list')
    >('../mcp-core/effective-tool-list');
    const { gateway } = buildGateway();
    const { service } = build({ gateway });

    await service.start();

    expect(gateway.registerHostToolNames).toHaveBeenCalledTimes(1);
    expect(gateway.registerHostToolNames).toHaveBeenCalledWith(
      buildToolDefinitions({ hasIDECapabilities: true }).map((t) => t.name),
    );
  });

  it('passes the gateway into the dispatcher and a hub into the server', async () => {
    const { gateway } = buildGateway();
    const { service } = build({ gateway });
    await service.start();

    const config = startHttpServer.mock.calls[0][0];
    expect(config.notificationHub).toBeDefined();
    await config.onMCPRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(handleMCPRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ gateway }),
    );
  });

  it('notifies the hub on a gateway change and closes its streams on stop', async () => {
    jest.useFakeTimers();
    try {
      const { gateway, fireToolsChanged, unsubscribe } = buildGateway();
      const { service } = build({ gateway });
      await service.start();
      const hub = startHttpServer.mock.calls[0][0].notificationHub;
      if (hub === undefined) throw new Error('expected a hub');
      const stream = Object.assign(new EventEmitter(), {
        destroyed: false,
        write: jest.fn(),
        end: jest.fn(),
      });
      hub.register(
        { kind: 'agent', agentId: 'a1', capability: 'privileged' },
        stream,
      );

      fireToolsChanged();
      jest.advanceTimersByTime(500);
      expect(stream.write).toHaveBeenCalledWith(
        expect.stringContaining('notifications/tools/list_changed'),
      );

      await service.disposeAsync();
      expect(stream.end).toHaveBeenCalled();
      expect(hub.streamCount).toBe(0);
      expect(unsubscribe).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('disposes the gateway on disposeAsync, after the server stopped', async () => {
    const { gateway } = buildGateway();
    const { service } = build({ gateway });
    await service.start();

    await service.disposeAsync();

    expect(gateway.dispose).toHaveBeenCalledTimes(1);
  });

  it('keeps the gateway alive across stop() so a restart can serve it', async () => {
    const { gateway } = buildGateway();
    const { service } = build({ gateway });
    await service.start();

    await service.stop();

    expect(gateway.dispose).not.toHaveBeenCalled();
  });

  it('leaves the current behaviour when no gateway is bound', async () => {
    const { service } = build();
    await service.start();

    const config = startHttpServer.mock.calls[0][0];
    expect(config.notificationHub).toBeUndefined();
    await config.onMCPRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const deps = handleMCPRequest.mock.calls[0][1];
    expect(deps.gateway).toBeUndefined();
  });
});
