import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import type { CliBootstrapResult } from '@ptah-extension/cli-engine';
import { bundleVersion, mainDatabaseState, serveCommand } from './serve';

const SQLITE_CONNECTION = Symbol.for('PtahSqliteConnection');

// Warm the engine module graph once, so the 60 s case timeouts measure the
// case and not the cold import (88.8 s on a CI shard). Same order as serve.ts:
// platform-core first.
beforeAll(async () => {
  await import('@ptah-extension/platform-core');
  await import('@ptah-extension/cli-agent-runtime');
  await import('@ptah-extension/cli-engine');
  await import('@ptah-extension/worker-runtime');
  await import('@ptah-extension/worker-protocol');
  await import('@ptah-extension/agent-sdk');
  await import('@ptah-extension/rpc-handlers');
}, 180_000);

it('reads the package version adjacent to the worker bundle', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ptah-worker-bundle-'));
  const previous = process.argv[1];
  try {
    await writeFile(
      join(directory, 'package.json'),
      JSON.stringify({ version: '9.8.7' }),
    );
    process.argv[1] = join(directory, 'worker.js');
    await expect(bundleVersion()).resolves.toBe('9.8.7');
  } finally {
    process.argv[1] = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

it('reports the main database state without a path', () => {
  const container = (unavailable: { reason: string } | null, registered = true) => ({
    isRegistered: () => registered,
    resolve: <T,>() => ({ unavailable }) as T,
  });
  expect(mainDatabaseState(container(null))).toEqual({
    open: true,
    detail: 'The main database is open.',
  });
  expect(mainDatabaseState(container({ reason: 'migration_failed' }))).toEqual({
    open: false,
    detail: 'The main database is unavailable (migration_failed).',
  });
  expect(mainDatabaseState(container(null, false)).open).toBe(false);
});

const checks = {
  nodeVersion: () => '22.0.0',
  sqliteMemory: async () => undefined,
  ptahVersion: async () => '1.2.3',
};

it('refuses auto approval, old Node, and SQLite failure before bootstrap', async () => {
  const bootstrap = jest.fn();
  const base = {
    port: 0,
    maxActiveTurns: 4,
    paths: {
      directory: '/tmp/unused',
      workspaces: '/tmp/unused/workspaces',
      tokens: '/tmp/unused/tokens',
      adminKey: '/tmp/unused/key',
      endpoint: '/tmp/unused/endpoint',
      events: '/tmp/unused/events',
    },
    argv: [],
    bootstrap,
  };
  await expect(
    serveCommand({ ...base, argv: ['--auto-approve'], checks }),
  ).rejects.toThrow('manual approval');
  await expect(
    serveCommand({ ...base, autoApprove: 'true', checks }),
  ).rejects.toThrow('manual approval');
  await expect(
    serveCommand({
      ...base,
      checks: { ...checks, nodeVersion: () => '21.9.0' },
    }),
  ).rejects.toThrow('Node 22');
  await expect(
    serveCommand({
      ...base,
      checks: {
        ...checks,
        sqliteMemory: async () => {
          throw new Error('native load');
        },
      },
    }),
  ).rejects.toThrow('better-sqlite3');
  expect(bootstrap).not.toHaveBeenCalled();
});

it.each(['SIGTERM', 'SIGINT'] as const)(
  'starts a loopback WebSocket and stops on %s',
  async (signal) => {
    const home = await mkdtemp(join(tmpdir(), 'ptah-worker-host-'));
    await import('@ptah-extension/platform-core');
    const { workerPaths } = await import('@ptah-extension/worker-runtime');
    const paths = workerPaths(home);
    const shutdown = new AbortController();
    const sdk = {
      initialize: jest.fn(async () => true),
      dispose: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      // Stand-ins for the driver lock and workspace lifecycle the session
      // composition resolves; this case drives no session.
      held: jest.fn(() => []),
      addFolder: jest.fn(),
    };
    // The main database: opened before the listener, closed after it stops.
    const order: string[] = [];
    const connection = {
      openAndMigrate: jest.fn(async () => {
        order.push('open');
      }),
      close: jest.fn(() => {
        order.push('close');
      }),
      vecLoadDiagnostic: { ok: true },
      unavailable: null,
    };
    const container = {
      clearInstances: jest.fn(),
      resolve: jest.fn((token: unknown) =>
        token === SQLITE_CONNECTION ? connection : sdk,
      ),
      isRegistered: jest.fn((token: unknown) => token === SQLITE_CONNECTION),
    };
    const bootstrap = jest.fn(
      (options: { pushAdapter?: unknown }) =>
        ({
          container,
          transport: {
            // The only engine call before listening: the autopilot check.
            call: jest.fn(async () => ({
              success: true,
              data: { enabled: false, permissionLevel: 'ask' },
            })),
          },
          pushAdapter: options.pushAdapter,
          fireAndForget: { handlePermissionResponse: jest.fn() },
          logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
        }) as unknown as CliBootstrapResult,
    );
    let ready!: (endpoint: { host: string; port: number }) => void;
    const endpointReady = new Promise<{ host: string; port: number }>(
      (resolve) => {
        ready = resolve;
      },
    );
    const serving = serveCommand({
      port: 0,
      maxActiveTurns: 4,
      paths,
      argv: [],
      checks,
      bootstrap,
      readiness: async () => ({ ready: true, checks: [] }),
      shutdown: shutdown.signal,
      onReady: ready,
    });
    let socket: WebSocket | undefined;
    try {
      const endpoint = await Promise.race([
        endpointReady,
        serving.then(() => {
          throw new Error('Worker stopped before listening');
        }),
      ]);
      socket = new WebSocket(`ws://${endpoint.host}:${endpoint.port}/rpc`);
      await new Promise<void>((resolve, reject) => {
        socket?.once('open', resolve);
        socket?.once('error', reject);
      });
      expect(bootstrap).toHaveBeenCalledWith(
        expect.objectContaining({
          bootstrapMode: 'full',
          hostProfile: expect.objectContaining({ host: 'worker' }),
        }),
      );
      // The worker opens the main database before it listens: the session
      // account gate reads it, so a closed one refuses every fresh session.
      expect(order).toEqual(['open']);
      const response = new Promise<void>((resolve) =>
        socket?.once('message', () => resolve()),
      );
      socket.send(
        JSON.stringify({
          v: 1,
          kind: 'req',
          id: '1',
          method: 'hello',
          params: {
            protocol: { min: 1, max: 1 },
            client: { name: 'test', version: '1' },
          },
        }),
      );
      await response;
      process.emit(signal);
      await serving;
      expect(order).toEqual(['open', 'close']);
    } finally {
      shutdown.abort();
      socket?.terminate();
      await serving;
      await rm(home, { recursive: true, force: true });
    }
  },
  // The first case loads the engine graph; under a shared verify lock it can exceed 5 s.
  60_000,
);
