/**
 * Removal of the persistent Antigravity `ptah` entries an earlier Ptah wrote
 * (TASK_2026_2297). Real filesystem, real config-file lock, temp home and
 * workspace only.
 *
 * Source-under-test: `retired-ptah-mcp-slots.ts`.
 */

import 'reflect-metadata';

// The `harness-sync` barrel reaches `@ptah-extension/vscode-core`, which
// imports `vscode`. Stubbed for module loading only, as in
// `ptah-mcp-slots.spec.ts`.
jest.mock('@ptah-extension/vscode-core', () => ({
  TOKENS: {},
  Logger: class {},
  WebviewManager: class {},
  FileSystemManager: class {},
}));

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import type { HarnessTargetId } from '@ptah-extension/shared';
import {
  isPtahLaneEntry,
  isPtahPersistentEntry,
  removeRetiredPtahEntry,
  retiredPtahMcpConfigPaths,
  sweepRetiredPtahMcpEntries,
} from './retired-ptah-mcp-slots';

const TOKEN = 'A'.repeat(43);

let tempHome: string;
let ws: string;

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), 'ptah-retired-home-'));
  ws = mkdtempSync(join(tmpdir(), 'ptah-retired-ws-'));
});

afterEach(() => {
  rmSync(tempHome, { recursive: true, force: true });
  rmSync(ws, { recursive: true, force: true });
});

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf-8');
}

function serversIn(path: string): Record<string, unknown> {
  const config = JSON.parse(readFileSync(path, 'utf-8')) as {
    mcpServers: Record<string, unknown>;
  };
  return config.mcpServers;
}

describe('retiredPtahMcpConfigPaths', () => {
  function paths(installed: HarnessTargetId[], roots: string[] = [ws]) {
    const set = new Set(installed);
    return retiredPtahMcpConfigPaths({
      workspaceRoots: roots,
      isInstalled: (target) => Promise.resolve(set.has(target)),
      homeDir: tempHome,
    });
  }

  it('names the agy home file and each workspace file when agy is installed', async () => {
    const other = join(ws, 'other');

    expect(await paths(['antigravity'], [ws, other, ws, ''])).toEqual([
      join(tempHome, '.gemini', 'config', 'mcp_config.json'),
      join(ws, '.agents', 'mcp_config.json'),
      join(other, '.agents', 'mcp_config.json'),
    ]);
  });

  it('names nothing when agy is not detected', async () => {
    expect(await paths(['claude', 'codex', 'cursor'])).toEqual([]);
  });
});

describe('isPtahPersistentEntry', () => {
  it.each([
    ['bare home URL', 'http://localhost:51820'],
    ['workspace URL', 'http://localhost:51820/workspace/D%3A%5Cws'],
    ['authenticated home URL', `http://localhost:51820/auth/${TOKEN}`],
    [
      'authenticated workspace URL',
      `http://localhost:51820/auth/${TOKEN}/workspace/%2Ftmp%2Fws`,
    ],
  ])('recognises the %s', (_label, url) => {
    expect(isPtahPersistentEntry({ serverUrl: url })).toBe(true);
  });

  it.each([
    [
      'a lane entry',
      {
        serverUrl: `http://localhost:51820/auth/${TOKEN}/agent/a1/workspace/x`,
      },
    ],
    ['a remote user server', { serverUrl: 'https://mcp.example.com/ptah' }],
    ['a different localhost path', { serverUrl: 'http://localhost:3000/mcp' }],
    [
      'an entry with headers',
      { serverUrl: 'http://localhost:51820', headers: { A: 'b' } },
    ],
    ['a stdio server', { command: 'npx', args: ['ptah'] }],
    ['a non-object', 'http://localhost:51820'],
    [
      'a workspace URL with a query',
      { serverUrl: 'http://localhost:8080/workspace/ws?tenant=dev' },
    ],
    [
      'a workspace URL with a fragment',
      { serverUrl: 'http://localhost:8080/workspace/ws#top' },
    ],
  ])('leaves %s alone', (_label, entry) => {
    expect(isPtahPersistentEntry(entry)).toBe(false);
  });
});

describe('isPtahLaneEntry', () => {
  it.each([
    ['lane URL', 'http://localhost:51820/agent/a1'],
    [
      'lane workspace URL',
      'http://localhost:51820/agent/a1/workspace/D%3A%5Cws',
    ],
    ['authenticated lane URL', `http://localhost:51820/auth/${TOKEN}/agent/a1`],
    [
      'authenticated lane workspace URL',
      `http://localhost:51820/auth/${TOKEN}/agent/a1/workspace/%2Ftmp%2Fws/`,
    ],
  ])('recognises the %s', (_label, url) => {
    expect(isPtahLaneEntry({ serverUrl: url })).toBe(true);
    expect(isPtahLaneEntry({ url })).toBe(true);
  });

  it.each([
    ['a persistent entry', { serverUrl: 'http://localhost:51820' }],
    ['a remote user server', { serverUrl: 'https://mcp.example.com/agent/a1' }],
    [
      'a non-localhost host',
      { serverUrl: 'http://127.0.0.1:51820/agent/a1/workspace/x' },
    ],
    [
      'a short auth token',
      { serverUrl: 'http://localhost:51820/auth/short/agent/a1' },
    ],
    [
      'an extra path segment',
      { serverUrl: 'http://localhost:51820/agent/a1/mcp' },
    ],
    [
      'a lane URL with headers',
      {
        serverUrl: `http://localhost:51820/auth/${TOKEN}/agent/a1`,
        headers: { A: 'b' },
      },
    ],
    [
      'a lane URL with a command',
      { serverUrl: 'http://localhost:51820/agent/a1', command: 'npx' },
    ],
    ['a non-object', 'http://localhost:51820/agent/a1'],
    [
      "a user's agent URL with a query",
      { serverUrl: 'http://localhost:8080/agent/local?tenant=dev' },
    ],
    [
      "a user's agent URL with a fragment",
      { serverUrl: 'http://localhost:8080/agent/local#dev' },
    ],
    [
      'a lane workspace URL with a query',
      { serverUrl: 'http://localhost:51820/agent/a1/workspace/ws?tenant=dev' },
    ],
  ])('leaves %s alone', (_label, entry) => {
    expect(isPtahLaneEntry(entry)).toBe(false);
  });

  it('still recognises percent-encoded `?` and `#` in a segment', () => {
    expect(
      isPtahLaneEntry({
        serverUrl: 'http://localhost:51820/agent/a%3F1/workspace/D%3A%5Cws%3Fx%23y',
      }),
    ).toBe(true);
    expect(
      isPtahPersistentEntry({ serverUrl: 'http://localhost:51820/workspace/ws%3Fx%23y' }),
    ).toBe(true);
  });
});

describe('removeRetiredPtahEntry', () => {
  const homeFile = () => join(tempHome, '.gemini', 'config', 'mcp_config.json');
  const wsFile = () => join(ws, '.agents', 'mcp_config.json');

  it('removes a Ptah-owned entry from the home file and keeps user servers', async () => {
    const github = { command: 'npx', args: ['-y', 'github-mcp'] };
    writeJson(homeFile(), {
      mcpServers: {
        github,
        ptah: { serverUrl: `http://localhost:51820/auth/${TOKEN}` },
      },
      other: { kept: true },
    });

    await expect(removeRetiredPtahEntry(homeFile())).resolves.toBe(
      'persistent',
    );

    expect(serversIn(homeFile())).toEqual({ github });
    expect(JSON.parse(readFileSync(homeFile(), 'utf-8')).other).toEqual({
      kept: true,
    });
  });

  it('removes a Ptah-owned entry from the workspace file', async () => {
    writeJson(wsFile(), {
      mcpServers: {
        ptah: {
          serverUrl: `http://localhost:51820/auth/${TOKEN}/workspace/${encodeURIComponent(ws)}`,
        },
      },
    });

    await expect(removeRetiredPtahEntry(wsFile())).resolves.toBe('persistent');

    expect(serversIn(wsFile())).toEqual({});
  });

  it("keeps a user's own `ptah` server and leaves the file byte-identical", async () => {
    writeJson(homeFile(), {
      mcpServers: { ptah: { serverUrl: 'https://mcp.example.com/ptah' } },
    });
    const before = readFileSync(homeFile());

    await expect(removeRetiredPtahEntry(homeFile())).resolves.toBe(false);

    expect(readFileSync(homeFile())).toEqual(before);
  });

  it('removes a leftover lane entry', async () => {
    const github = { command: 'npx', args: ['-y', 'github-mcp'] };
    writeJson(homeFile(), {
      mcpServers: {
        github,
        ptah: {
          serverUrl: `http://localhost:51820/auth/${TOKEN}/agent/a1/workspace/${encodeURIComponent(ws)}`,
        },
      },
    });

    await expect(removeRetiredPtahEntry(homeFile())).resolves.toBe('lane');

    expect(serversIn(homeFile())).toEqual({ github });
  });

  it('removes a leftover lane entry without an `/auth/` segment', async () => {
    writeJson(wsFile(), {
      mcpServers: {
        ptah: {
          serverUrl: `http://localhost:51820/agent/a1/workspace/${encodeURIComponent(ws)}`,
        },
      },
    });

    await expect(removeRetiredPtahEntry(wsFile())).resolves.toBe('lane');

    expect(serversIn(wsFile())).toEqual({});
  });

  it('keeps a lane-shaped entry that carries headers, byte-identical', async () => {
    writeJson(homeFile(), {
      mcpServers: {
        ptah: {
          serverUrl: `http://localhost:51820/auth/${TOKEN}/agent/a1`,
          headers: { Authorization: 'Bearer user' },
        },
      },
    });
    const before = readFileSync(homeFile());

    await expect(removeRetiredPtahEntry(homeFile())).resolves.toBe(false);

    expect(readFileSync(homeFile())).toEqual(before);
  });

  it('creates nothing when the file is absent', async () => {
    await expect(removeRetiredPtahEntry(homeFile())).resolves.toBe(false);
    await expect(removeRetiredPtahEntry(wsFile())).resolves.toBe(false);

    expect(existsSync(homeFile())).toBe(false);
    expect(existsSync(join(tempHome, '.gemini'))).toBe(false);
    expect(existsSync(join(ws, '.agents'))).toBe(false);
  });

  it('refuses a file that does not parse and writes nothing over it', async () => {
    mkdirSync(dirname(homeFile()), { recursive: true });
    writeFileSync(homeFile(), '{ "mcpServers": ', 'utf-8');

    await expect(removeRetiredPtahEntry(homeFile())).rejects.toThrow(
      'is not valid JSON; left unchanged',
    );

    expect(readFileSync(homeFile(), 'utf-8')).toBe('{ "mcpServers": ');
  });
});

describe('sweepRetiredPtahMcpEntries', () => {
  function sweep(revokeCredential: (path: string) => Promise<unknown>) {
    const logger = { info: jest.fn(), warn: jest.fn() };
    return {
      logger,
      run: sweepRetiredPtahMcpEntries({
        workspaceRoots: [ws],
        isInstalled: (target) => Promise.resolve(target === 'antigravity'),
        homeDir: tempHome,
        revokeCredential,
        logger,
      }),
    };
  }

  it('revokes the credential of every retired file and removes Ptah entries', async () => {
    const homePath = join(tempHome, '.gemini', 'config', 'mcp_config.json');
    const wsPath = join(ws, '.agents', 'mcp_config.json');
    writeJson(homePath, {
      mcpServers: { ptah: { serverUrl: 'http://localhost:51820' } },
    });
    const revoked: string[] = [];

    const { run, logger } = sweep((path) => {
      revoked.push(path);
      return Promise.resolve(true);
    });
    await run;

    expect(revoked).toEqual([homePath, wsPath]);
    expect(serversIn(homePath)).toEqual({});
    expect(existsSync(wsPath)).toBe(false);
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(String(logger.info.mock.calls[0]?.[0])).toBe(
      `[CodeExecutionMCP] Removed retired ptah entry from ${homePath} (persistent)`,
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('names the lane shape in the log when it removes a leftover lane entry', async () => {
    const homePath = join(tempHome, '.gemini', 'config', 'mcp_config.json');
    writeJson(homePath, {
      mcpServers: {
        ptah: { serverUrl: `http://localhost:51820/auth/${TOKEN}/agent/a1` },
      },
    });

    const { run, logger } = sweep(() => Promise.resolve(true));
    await run;

    expect(serversIn(homePath)).toEqual({});
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(String(logger.info.mock.calls[0]?.[0])).toBe(
      `[CodeExecutionMCP] Removed retired ptah entry from ${homePath} (lane)`,
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('logs a failure for one file, keeps going, and never rejects', async () => {
    const homePath = join(tempHome, '.gemini', 'config', 'mcp_config.json');
    const wsPath = join(ws, '.agents', 'mcp_config.json');
    mkdirSync(dirname(homePath), { recursive: true });
    writeFileSync(homePath, 'not json', 'utf-8');
    writeJson(wsPath, {
      mcpServers: { ptah: { serverUrl: 'http://localhost:51820/workspace/x' } },
    });

    const { run, logger } = sweep(() => Promise.resolve(true));
    await expect(run).resolves.toBeUndefined();

    expect(readFileSync(homePath, 'utf-8')).toBe('not json');
    expect(serversIn(wsPath)).toEqual({});
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(String(logger.warn.mock.calls[0]?.[0])).not.toContain('not json');
  });

  // Regression #1469: in a linked git worktree (`.git` is a FILE) the tracked
  // `.agents/mcp_config.json` must stay byte-identical, so the task branch
  // gets no config churn. The home file is swept as before.
  it('leaves the workspace file of a linked git worktree byte-identical', async () => {
    const homePath = join(tempHome, '.gemini', 'config', 'mcp_config.json');
    const wsPath = join(ws, '.agents', 'mcp_config.json');
    writeFileSync(join(ws, '.git'), 'gitdir: /repo/.git/worktrees/task\n');
    writeJson(homePath, {
      mcpServers: { ptah: { serverUrl: 'http://localhost:51820' } },
    });
    writeJson(wsPath, {
      mcpServers: { ptah: { serverUrl: 'http://localhost:51820/workspace/x' } },
    });
    const before = readFileSync(wsPath);
    const revoked: string[] = [];

    const { run, logger } = sweep((path) => {
      revoked.push(path);
      return Promise.resolve(true);
    });
    await run;

    expect(readFileSync(wsPath).equals(before)).toBe(true);
    // No lock file or backup was created beside it either.
    expect(readdirSync(dirname(wsPath))).toEqual(['mcp_config.json']);
    expect(serversIn(homePath)).toEqual({});
    expect(revoked).toEqual([homePath, wsPath]);
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('still sweeps the workspace file of a main checkout (`.git` directory)', async () => {
    const wsPath = join(ws, '.agents', 'mcp_config.json');
    mkdirSync(join(ws, '.git'));
    writeJson(wsPath, {
      mcpServers: {
        ptah: { serverUrl: 'http://localhost:51820/workspace/x' },
        mine: { command: 'node' },
      },
    });

    const { run } = sweep(() => Promise.resolve(true));
    await run;

    expect(serversIn(wsPath)).toEqual({ mine: { command: 'node' } });
  });
});
