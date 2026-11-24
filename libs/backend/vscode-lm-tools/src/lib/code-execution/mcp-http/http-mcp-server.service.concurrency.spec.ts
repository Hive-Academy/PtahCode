/**
 * `CodeExecutionMCP` on a REAL filesystem: it writes no MCP config file.
 *
 * `http-mcp-server.service.spec.ts` mocks `fs`, so it proves no write CALL is
 * made. This spec keeps the real `fs` and a real temporary workspace, and
 * proves the observable half: after a chat start, a child-session retain and
 * release, and a stop, the workspace holds no new file and an existing
 * `.mcp.json` (including a `ptah` entry an earlier Ptah wrote, D-U5 Option 1)
 * is byte-identical (TASK_2026_979_9e1f, decision 10).
 *
 * The retired Antigravity sweep (TASK_2026_2297) is the one file write this
 * service still makes, and it stays as it was; its cases are at the end.
 *
 * Everything mocked below is mocked for module-loading reasons only (the
 * `vscode` ambient module and the transitive SDK imports), never to weaken the
 * behaviour under test.
 */

import 'reflect-metadata';

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

jest.mock('../ptah-api-builder.service', () => ({
  IDE_CAPABILITIES_TOKEN: Symbol.for('IDECapabilities'),
  PtahAPIBuilder: class PtahAPIBuilderStub {},
}));

jest.mock('../../permission/permission-prompt.service', () => ({
  PermissionPromptService: class PermissionPromptServiceStub {},
}));

jest.mock('../mcp-core', () => ({ handleMCPRequest: jest.fn() }));

// The retired-slot suite below points `~` at a temp home. The facets read it
// through `os.homedir()`, and on Windows that ignores a changed USERPROFILE
// inside jest, so the module is wrapped here. Unset, it is the real function.
let mockHome: string | undefined;
jest.mock('os', () => {
  const actual = jest.requireActual<typeof import('os')>('os');
  return { ...actual, homedir: () => mockHome ?? actual.homedir() };
});

jest.mock('./http-server.handler', () => ({
  startHttpServer: jest.fn(),
  stopHttpServer: jest.fn(),
  getConfiguredPort: jest.fn(),
}));

import type * as http from 'http';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { homedir, tmpdir } from 'os';
import { dirname, join } from 'path';

import type { Logger } from '@ptah-extension/vscode-core';
import type {
  IStateStorage,
  IWorkspaceProvider,
} from '@ptah-extension/platform-core';
import {
  createMockStateStorage,
  createMockWorkspaceProvider,
} from '@ptah-extension/platform-core/testing';
import { createMockLogger } from '@ptah-extension/shared/testing';
import type { IHarnessCliDetector } from '@ptah-extension/harness-sync';
import type { HarnessTargetId } from '@ptah-extension/shared';

import { CodeExecutionMCP } from './http-mcp-server.service';
import type { PtahAPIBuilder } from '../ptah-api-builder.service';
import type { PermissionPromptService } from '../../permission/permission-prompt.service';
import type { PtahAPI } from '../types';
import {
  startHttpServer as startHttpServerMock,
  stopHttpServer as stopHttpServerMock,
  getConfiguredPort as getConfiguredPortMock,
} from './http-server.handler';

const startHttpServer = startHttpServerMock as jest.MockedFunction<
  typeof startHttpServerMock
>;
const stopHttpServer = stopHttpServerMock as jest.MockedFunction<
  typeof stopHttpServerMock
>;
const getConfiguredPort = getConfiguredPortMock as jest.MockedFunction<
  typeof getConfiguredPortMock
>;

const PORT = 51820;

let workspaceRoot: string;
let configPath: string;
let service: CodeExecutionMCP;

function buildService(): CodeExecutionMCP {
  const apiBuilder = {
    build: jest.fn((): PtahAPI => ({}) as unknown as PtahAPI),
    hasSymbolAndMemoryLayer: jest.fn(() => false),
  } as unknown as PtahAPIBuilder;

  return new CodeExecutionMCP(
    apiBuilder,
    createMockLogger() as unknown as Logger,
    createMockStateStorage() as unknown as IStateStorage,
    createMockWorkspaceProvider({
      folders: [workspaceRoot],
    }) as unknown as IWorkspaceProvider,
    {} as unknown as PermissionPromptService,
    undefined,
    undefined,
    // No CLI detector: the retired-entry sweep touches no file without one.
    undefined,
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  workspaceRoot = mkdtempSync(join(tmpdir(), 'ptah-mcp-concurrency-'));
  configPath = join(workspaceRoot, '.mcp.json');

  getConfiguredPort.mockReturnValue(PORT);
  startHttpServer.mockResolvedValue({
    server: {} as unknown as http.Server,
    port: PORT,
  });
  stopHttpServer.mockResolvedValue(undefined);

  service = buildService();
  await service.start();
});

afterEach(async () => {
  await service.disposeAsync();
  rmSync(workspaceRoot, { recursive: true, force: true });
});

describe('CodeExecutionMCP on a real disk — no MCP config file is written', () => {
  it('a chat start, a retain/release and a stop leave an empty workspace empty', async () => {
    const child = mkdtempSync(join(tmpdir(), 'ptah-mcp-child-'));
    try {
      await expect(service.ensureRegisteredForSubagents()).resolves.toEqual({
        registered: true,
      });
      await expect(service.retainRoot(child)).resolves.toEqual({
        registered: true,
      });
      await service.releaseRoot(child);
      await service.stop();

      expect(readdirSync(workspaceRoot)).toEqual([]);
      expect(readdirSync(child)).toEqual([]);
    } finally {
      rmSync(child, { recursive: true, force: true });
    }
  });

  it('leaves an existing .mcp.json, with an earlier ptah entry, byte-identical', async () => {
    const before =
      JSON.stringify(
        {
          mcpServers: {
            'my-own-server': { command: 'node', args: ['x.js'] },
            ptah: {
              type: 'http',
              url: `http://localhost:${PORT}/auth/${'A'.repeat(43)}/workspace/${encodeURIComponent(workspaceRoot)}`,
            },
          },
        },
        null,
        2,
      ) + '\n';
    writeFileSync(configPath, before, 'utf-8');

    await service.ensureRegisteredForSubagents();
    await service.retainRoot(workspaceRoot);
    await service.releaseRoot(workspaceRoot);
    await service.stop();

    expect(readFileSync(configPath, 'utf-8')).toBe(before);
    expect(readdirSync(workspaceRoot)).toEqual(['.mcp.json']);
  });
});

describe('retired Antigravity slots (TASK_2026_2297)', () => {
  const TOKEN = 'B'.repeat(43);
  let home: string;
  let detected: Set<HarnessTargetId>;
  let agyService: CodeExecutionMCP;

  const homeFile = () => join(home, '.gemini', 'config', 'mcp_config.json');
  const wsFile = () => join(workspaceRoot, '.agents', 'mcp_config.json');

  function writeJson(path: string, value: unknown): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf-8');
  }

  function servers(path: string): Record<string, unknown> {
    return (
      JSON.parse(readFileSync(path, 'utf-8')) as {
        mcpServers: Record<string, unknown>;
      }
    ).mcpServers;
  }

  beforeEach(async () => {
    home = mkdtempSync(join(tmpdir(), 'ptah-mcp-agy-home-'));
    // The spec must never reach the developer's real home directory: the
    // guard fails the test before the service touches anything.
    mockHome = home;
    expect(homedir()).toBe(home);
    detected = new Set<HarnessTargetId>(['antigravity']);
    const detector = {
      isInstalled: (target: HarnessTargetId) =>
        Promise.resolve(detected.has(target)),
    } as unknown as IHarnessCliDetector;
    agyService = new CodeExecutionMCP(
      {
        build: jest.fn((): PtahAPI => ({}) as unknown as PtahAPI),
        hasSymbolAndMemoryLayer: jest.fn(() => false),
      } as unknown as PtahAPIBuilder,
      createMockLogger() as unknown as Logger,
      createMockStateStorage() as unknown as IStateStorage,
      createMockWorkspaceProvider({
        folders: [workspaceRoot],
      }) as unknown as IWorkspaceProvider,
      {} as unknown as PermissionPromptService,
      undefined,
      undefined,
      detector,
    );
    await agyService.start();
  });

  afterEach(async () => {
    await agyService.disposeAsync();
    mockHome = undefined;
    rmSync(home, { recursive: true, force: true });
  });

  it('writes no antigravity entry when agy is installed, and no .mcp.json', async () => {
    await expect(agyService.ensureRegisteredForSubagents()).resolves.toEqual({
      registered: true,
    });

    expect(existsSync(dirname(homeFile()))).toBe(false);
    expect(existsSync(dirname(wsFile()))).toBe(false);
    expect(existsSync(configPath)).toBe(false);
  });

  it('removes the Ptah-owned entries an earlier Ptah wrote and keeps user servers', async () => {
    const github = { command: 'npx', args: ['-y', 'github-mcp'] };
    const docs = { serverUrl: 'https://docs.example/mcp' };
    writeJson(homeFile(), {
      mcpServers: {
        github,
        ptah: { serverUrl: `http://localhost:${PORT}/auth/${TOKEN}` },
      },
    });
    writeJson(wsFile(), {
      mcpServers: {
        docs,
        ptah: {
          serverUrl: `http://localhost:${PORT}/auth/${TOKEN}/workspace/${encodeURIComponent(workspaceRoot)}`,
        },
      },
    });

    await agyService.ensureRegisteredForSubagents();

    expect(servers(homeFile())).toEqual({ github });
    expect(servers(wsFile())).toEqual({ docs });
  });

  it("removes a leftover stream-json lane entry and keeps a user's own `ptah` server", async () => {
    const lane = {
      serverUrl: `http://localhost:${PORT}/auth/${TOKEN}/agent/a1/workspace/${encodeURIComponent(workspaceRoot)}`,
    };
    const userPtah = { serverUrl: 'https://mcp.example.com/ptah' };
    writeJson(homeFile(), { mcpServers: { ptah: lane } });
    writeJson(wsFile(), { mcpServers: { ptah: userPtah } });

    await agyService.ensureRegisteredForSubagents();

    expect(servers(homeFile())).toEqual({});
    expect(servers(wsFile())).toEqual({ ptah: userPtah });
  });

  it('leaves the files alone when agy is not detected', async () => {
    detected.clear();
    const stale = { serverUrl: `http://localhost:${PORT}` };
    writeJson(homeFile(), { mcpServers: { ptah: stale } });

    await agyService.ensureRegisteredForSubagents();

    expect(servers(homeFile())).toEqual({ ptah: stale });
  });
});
