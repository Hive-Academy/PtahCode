/**
 * `AntigravityCliAdapter` stream-json lane and the home
 * `~/.gemini/config/mcp_config.json` (TASK_2026_979 decision rows 13 and 36).
 *
 * `HOME` is a throwaway temp directory standing in for the user's home, and
 * only the spawn is faked, so the property under test is what lands on disk.
 *
 * What it pins:
 *
 * - A stream-json spawn with an MCP port writes nothing to the home
 *   `mcp_config.json`: an absent file stays absent, a user's file stays
 *   byte-identical, and no lane credential reaches the disk or the argv.
 * - The lane says once that it has no Ptah MCP server.
 * - The lane credential is still revoked (`onMcpConfigRestored`) once, when
 *   the lane ends or fails to start, and not before.
 */

// Some of the adapter's imports pull in `vscode-core`'s tsyringe decorators.
// Same reason the other DI-touching specs in this lib import it first.
import 'reflect-metadata';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { EventEmitter } from 'events';
import { tmpdir } from 'os';
import { join } from 'path';
import { PassThrough } from 'stream';

const mockSpawnCli = jest.fn();

jest.mock('./cli-adapter.utils', () => {
  const actual = jest.requireActual<typeof import('./cli-adapter.utils')>(
    './cli-adapter.utils',
  );
  return {
    ...actual,
    spawnCli: (...args: unknown[]) => mockSpawnCli(...args),
    resolveCliPath: () => Promise.resolve('agy'),
    resolveDirectSpawn: () =>
      Promise.resolve({ command: 'agy', prefixArgs: [] }),
  };
});

jest.mock('@ptah-extension/platform-core', () => {
  const actual = jest.requireActual<
    typeof import('@ptah-extension/platform-core')
  >('@ptah-extension/platform-core');
  return {
    ...actual,
    killProcessTree: jest.fn().mockResolvedValue(undefined),
  };
});

import { AntigravityCliAdapter } from './antigravity-cli.adapter';
import { killProcessTree } from '@ptah-extension/platform-core';
import type { CliOutputSegment } from '@ptah-extension/shared';

interface FakeChild extends EventEmitter {
  stdout: PassThrough;
  stderr: PassThrough;
  stdin: { end: jest.Mock; write: jest.Mock };
  kill: jest.Mock;
  killed: boolean;
  pid: number;
  whenSpawned: Promise<number | null>;
}

function createFakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdin = { end: jest.fn(), write: jest.fn() };
  child.kill = jest.fn();
  child.killed = false;
  child.pid = 4242;
  child.whenSpawned = Promise.resolve(4242);
  return child;
}

describe('AntigravityCliAdapter — stream-json writes no MCP config (TASK_2026_979)', () => {
  const TOKEN = 'b'.repeat(43);
  let tempHome: string;
  let ws: string;
  let previousHome: string | undefined;
  let previousUserProfile: string | undefined;
  let configPath: string;
  let child: FakeChild;
  let adapter: AntigravityCliAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    tempHome = mkdtempSync(join(tmpdir(), 'agy-adapter-home-'));
    ws = mkdtempSync(join(tmpdir(), 'agy-adapter-ws-'));
    configPath = join(tempHome, '.gemini', 'config', 'mcp_config.json');

    previousHome = process.env['HOME'];
    previousUserProfile = process.env['USERPROFILE'];
    process.env['HOME'] = tempHome;
    process.env['USERPROFILE'] = tempHome;

    child = createFakeChild();
    mockSpawnCli.mockImplementation(() => child);
    // No spawner: the ACP probe fails and the lane runs on stream-json.
    adapter = new AntigravityCliAdapter(undefined, async () => true);
  });

  afterEach(() => {
    if (previousHome === undefined) delete process.env['HOME'];
    else process.env['HOME'] = previousHome;
    if (previousUserProfile === undefined) delete process.env['USERPROFILE'];
    else process.env['USERPROFILE'] = previousUserProfile;
    rmSync(tempHome, { recursive: true, force: true });
    rmSync(ws, { recursive: true, force: true });
  });

  function seedUserConfig(entries: Record<string, unknown>): string {
    mkdirSync(join(tempHome, '.gemini', 'config'), { recursive: true });
    const text = JSON.stringify({ mcpServers: entries }, null, 2);
    writeFileSync(configPath, text, 'utf-8');
    return text;
  }

  function spawnArgv(): string[] {
    return (mockSpawnCli.mock.calls[0]?.[1] as string[] | undefined) ?? [];
  }

  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  it('records zero writes to an absent home mcp_config.json', async () => {
    const handle = await adapter.runSdk({
      task: 'do a thing',
      workingDirectory: ws,
      mcpPort: 51234,
      mcpToken: TOKEN,
      agentId: 'lane-1',
    });
    expect(existsSync(configPath)).toBe(false);
    child.emit('close', 0, null);
    await handle.done;
    await settle();
    expect(existsSync(configPath)).toBe(false);
  });

  it("leaves the user's file byte-identical, their own `ptah` entry included", async () => {
    const before = seedUserConfig({
      ptah: { serverUrl: 'http://localhost:51820' },
      github: { command: 'github-mcp', args: ['--stdio'] },
    });
    const handle = await adapter.runSdk({
      task: 'do a thing',
      workingDirectory: ws,
      mcpPort: 51234,
      mcpToken: TOKEN,
      agentId: 'lane-1',
    });
    expect(readFileSync(configPath, 'utf-8')).toBe(before);
    child.emit('close', 0, null);
    await handle.done;
    await settle();
    expect(readFileSync(configPath, 'utf-8')).toBe(before);
  });

  it('puts no lane credential or Ptah URL in the argv', async () => {
    const handle = await adapter.runSdk({
      task: 'do a thing',
      workingDirectory: ws,
      mcpPort: 51234,
      mcpToken: TOKEN,
      agentId: 'lane-1',
    });
    const argv = spawnArgv().join(' ');
    expect(argv).not.toContain(TOKEN);
    expect(argv).not.toContain('localhost:51234');
    child.emit('close', 0, null);
    await handle.done;
  });

  it('says once that the lane has no Ptah MCP server, and reports no MCP gate', async () => {
    const handle = await adapter.runSdk({
      task: 'do a thing',
      workingDirectory: ws,
      mcpPort: 51234,
      mcpToken: TOKEN,
      agentId: 'lane-1',
    });
    const segments: CliOutputSegment[] = [];
    handle.onSegment?.((segment) => segments.push(segment));
    const notices = segments.filter(
      (segment) =>
        segment.type === 'info' &&
        segment.content.includes('no Ptah MCP server'),
    );
    expect(notices).toHaveLength(1);
    expect(handle.mcpConfigWriteFailed).toBeUndefined();
    expect(handle.onMcpAttachmentTimeout).toBeUndefined();
    child.emit('close', 0, null);
    await handle.done;
  });

  it('prints no MCP notice when the spawn carries no MCP port', async () => {
    const handle = await adapter.runSdk({
      task: 'do a thing',
      workingDirectory: ws,
    });
    const segments: CliOutputSegment[] = [];
    handle.onSegment?.((segment) => segments.push(segment));
    expect(
      segments.some((segment) => segment.content.includes('Ptah MCP')),
    ).toBe(false);
    child.emit('close', 0, null);
    await handle.done;
    expect(existsSync(configPath)).toBe(false);
  });

  it('revokes the lane credential once when the lane ends, not before', async () => {
    const revoke = jest.fn();
    const handle = await adapter.runSdk({
      task: 'report',
      workingDirectory: ws,
      mcpPort: 51234,
      mcpToken: TOKEN,
      agentId: 'lane-7',
      onMcpConfigRestored: revoke,
    });
    await settle();
    expect(revoke).not.toHaveBeenCalled();
    child.emit('close', 0, null);
    await handle.done;
    await settle();
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it('revokes the credential and stops the child after a failed launch', async () => {
    const revoke = jest.fn();
    child.stdin.write.mockImplementationOnce(() => {
      throw new Error('stdin failed');
    });
    await expect(
      adapter.runSdk({
        task: 'report',
        workingDirectory: ws,
        mcpPort: 51234,
        mcpToken: TOKEN,
        agentId: 'lane-7',
        onMcpConfigRestored: revoke,
      }),
    ).rejects.toThrow('stdin failed');
    expect(revoke).toHaveBeenCalledTimes(1);
    await settle();
    expect(killProcessTree).toHaveBeenCalledWith(4242);
    expect(child.kill).not.toHaveBeenCalled();
    expect(existsSync(configPath)).toBe(false);
  });

  it('rethrows a failed launch at once when the child never reports a pid', async () => {
    const revoke = jest.fn();
    child.whenSpawned = new Promise<number | null>(() => undefined);
    child.stdin.write.mockImplementationOnce(() => {
      throw new Error('stdin failed');
    });
    await expect(
      adapter.runSdk({
        task: 'report',
        workingDirectory: ws,
        mcpPort: 51234,
        mcpToken: TOKEN,
        agentId: 'lane-7',
        onMcpConfigRestored: revoke,
      }),
    ).rejects.toThrow('stdin failed');
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(killProcessTree).not.toHaveBeenCalled();
  });

  it('starts two lanes at once without serializing their startups', async () => {
    const children = [createFakeChild(), createFakeChild()];
    mockSpawnCli
      .mockImplementationOnce(() => children[0])
      .mockImplementationOnce(() => children[1]);
    const [first, second] = await Promise.all([
      adapter.runSdk({
        task: 'one',
        workingDirectory: ws,
        mcpPort: 51234,
        mcpToken: TOKEN,
        agentId: 'lane-1',
      }),
      adapter.runSdk({
        task: 'two',
        workingDirectory: ws,
        mcpPort: 51234,
        mcpToken: TOKEN,
        agentId: 'lane-2',
      }),
    ]);
    expect(mockSpawnCli).toHaveBeenCalledTimes(2);
    children[0].emit('close', 0, null);
    children[1].emit('close', 0, null);
    await Promise.all([first.done, second.done]);
    expect(existsSync(configPath)).toBe(false);
  });
});
