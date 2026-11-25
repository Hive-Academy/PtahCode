import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { StdioServerParameters } from '@modelcontextprotocol/sdk/client/stdio.js';
import { PassThrough } from 'node:stream';
import {
  buildStdioChildEnv,
  STDIO_FIRST_LIST_TIMEOUT_MS,
  STDIO_IDLE_MS,
  STDIO_RESTART_BACKOFF_MS,
  STDIO_RESTART_LIMIT_DETAIL,
  STDIO_RESTART_WINDOW_MS,
  STDIO_STDERR_LINES,
  StdioServerHost,
  type StdioClientOptions,
  type StdioHostClock,
  type StdioServerSpec,
  type StdioTransportHandle,
} from './stdio-server-host';
import { UPSTREAM_LIST_TIMEOUT_MS } from './upstream-client';

const ROOT = '/ws/root';
const SECRET = 'stdio-secret-value';

const SPEC: StdioServerSpec = {
  command: 'node',
  args: ['server.js', `--token=${SECRET}`],
  env: { API_TOKEN: SECRET },
  cwd: ROOT,
};

/** A manual clock: timers run only when the spec advances it. */
class FakeClock implements StdioHostClock {
  private t = 0;
  private nextId = 1;
  private readonly timers = new Map<
    number,
    { at: number; fn: () => void; every?: number }
  >();

  now(): number {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number): unknown {
    const id = this.nextId++;
    this.timers.set(id, { at: this.t + ms, fn });
    return id;
  }
  clearTimeout(handle: unknown): void {
    this.timers.delete(handle as number);
  }
  setInterval(fn: () => void, ms: number): unknown {
    const id = this.nextId++;
    this.timers.set(id, { at: this.t + ms, fn, every: ms });
    return id;
  }
  clearInterval(handle: unknown): void {
    this.timers.delete(handle as number);
  }
  intervalCount(): number {
    return [...this.timers.values()].filter((t) => t.every !== undefined)
      .length;
  }
  async advance(ms: number): Promise<void> {
    const target = this.t + ms;
    for (;;) {
      const due = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort(([, a], [, b]) => a.at - b.at)[0];
      if (due === undefined) break;
      const [id, timer] = due;
      this.t = timer.at;
      if (timer.every === undefined) this.timers.delete(id);
      else timer.at += timer.every;
      timer.fn();
      await flush();
    }
    this.t = target;
    await flush();
  }
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

interface Spawned {
  readonly params: StdioServerParameters;
  readonly pid: number;
  readonly server: InMemoryTransport;
  readonly stderr: PassThrough;
}

interface Harness {
  host: StdioServerHost;
  clock: FakeClock;
  spawned: Spawned[];
  killed: number[];
  logs: unknown[];
  /** Resolve the pending `slow` tool call. */
  release(): void;
  options(overrides?: Partial<StdioClientOptions>): StdioClientOptions;
}

function harness(failStart: () => boolean = () => false): Harness {
  const clock = new FakeClock();
  const spawned: Spawned[] = [];
  const killed: number[] = [];
  const logs: unknown[] = [];
  let releaseSlow: () => void = () => undefined;
  let pid = 100;

  const createTransport = (
    params: StdioServerParameters,
  ): StdioTransportHandle => {
    const stderr = new PassThrough();
    if (failStart()) {
      const failed: StdioTransportHandle = {
        pid: null,
        stderr,
        start: () => Promise.reject(new Error('spawn node ENOENT')),
        send: () => Promise.resolve(),
        close: () => Promise.resolve(),
      };
      spawned.push({
        params,
        pid: -1,
        server: InMemoryTransport.createLinkedPair()[1],
        stderr,
      });
      return failed;
    }
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const server = new McpServer({ name: 'fake', version: '1.0.0' });
    server.registerTool('search', { description: 'search tool' }, async () => ({
      content: [{ type: 'text', text: 'found' }],
    }));
    server.registerTool('slow', { description: 'slow tool' }, async () => {
      await new Promise<void>((resolve) => {
        releaseSlow = resolve;
      });
      return { content: [{ type: 'text', text: 'done' }] };
    });
    void server.connect(serverSide);
    pid += 1;
    spawned.push({ params, pid, server: serverSide, stderr });
    return Object.assign(clientSide, { pid, stderr });
  };

  const host = new StdioServerHost({
    createTransport,
    killTree: async (target) => {
      killed.push(target);
    },
    clock,
    logger: {
      debug: (message, context) => logs.push([message, context]),
      warn: (message, context) => logs.push([message, context]),
    },
  });
  return {
    host,
    clock,
    spawned,
    killed,
    logs,
    release: () => releaseSlow(),
    options: (overrides = {}) => ({
      spec: SPEC,
      serverName: 'local',
      ...overrides,
    }),
  };
}

/** The server side ends the session, as a crashed process would. */
async function crash(spawned: Spawned): Promise<void> {
  await spawned.server.close();
  await flush();
}

describe('StdioServerHost', () => {
  describe('environment (M4)', () => {
    const saved = process.env['ANTHROPIC_API_KEY'];
    afterEach(() => {
      if (saved === undefined) delete process.env['ANTHROPIC_API_KEY'];
      else process.env['ANTHROPIC_API_KEY'] = saved;
    });

    it('spawns with the default env plus the entry env only, as an argument array', async () => {
      process.env['ANTHROPIC_API_KEY'] = 'sk-ant-sentinel';
      const h = harness();
      const client = h.host.createClient(h.options());
      await client.connect();

      const [{ params }] = h.spawned;
      expect(params.command).toBe('node');
      expect(params.args).toEqual(SPEC.args);
      expect(params.cwd).toBe(ROOT);
      expect(params.stderr).toBe('pipe');
      expect(params).not.toHaveProperty('shell');
      expect(params.env).not.toHaveProperty('ANTHROPIC_API_KEY');
      expect(params.env?.['API_TOKEN']).toBe(SECRET);
      expect(Object.values(params.env ?? {})).not.toContain('sk-ant-sentinel');
      await h.host.dispose();
    });

    it('builds the child env from getDefaultEnvironment and the entry', () => {
      process.env['ANTHROPIC_API_KEY'] = 'sk-ant-sentinel';
      const env = buildStdioChildEnv({ ONLY: 'mine' });
      expect(env['ONLY']).toBe('mine');
      expect(env).not.toHaveProperty('ANTHROPIC_API_KEY');
      if (process.env['PATH'] !== undefined) {
        expect(env['PATH']).toBe(process.env['PATH']);
      }
    });
  });

  describe('protocol', () => {
    it('lists and calls tools over the transport', async () => {
      const h = harness();
      const client = h.host.createClient(h.options());

      const tools = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual(['search', 'slow']);
      const result = await client.callTool('search', {});
      expect(result['content']).toEqual([{ type: 'text', text: 'found' }]);
      expect(h.spawned).toHaveLength(1);
      expect(client.running).toBe(true);
      await h.host.dispose();
    });

    it('gives the first list after each spawn the cold-start timeout (S1)', async () => {
      const h = harness();
      const listSpy = jest.spyOn(Client.prototype, 'listTools');
      try {
        const client = h.host.createClient(h.options());
        await client.listTools();
        await client.listTools();
        await crash(h.spawned[0]);
        const restarted = client.listTools();
        await h.clock.advance(STDIO_RESTART_BACKOFF_MS[0]);
        await restarted;

        const timeouts = listSpy.mock.calls.map((call) => call[1]?.timeout);
        expect(timeouts).toEqual([
          STDIO_FIRST_LIST_TIMEOUT_MS,
          UPSTREAM_LIST_TIMEOUT_MS,
          STDIO_FIRST_LIST_TIMEOUT_MS,
        ]);
      } finally {
        listSpy.mockRestore();
        await h.host.dispose();
      }
    });

    it('shares one start between concurrent callers', async () => {
      const h = harness();
      const client = h.host.createClient(h.options());
      await Promise.all([
        client.connect(),
        client.listTools(),
        client.connect(),
      ]);
      expect(h.spawned).toHaveLength(1);
      await h.host.dispose();
    });
  });

  describe('restarts', () => {
    it('backs off 1, 2, then 4 s and refuses after 3 restarts in 10 minutes', async () => {
      const h = harness();
      const onDisconnected = jest.fn();
      const client = h.host.createClient(h.options({ onDisconnected }));
      await client.connect();

      for (const [index, delay] of STDIO_RESTART_BACKOFF_MS.entries()) {
        await crash(h.spawned[index]);
        expect(onDisconnected).toHaveBeenCalledTimes(index + 1);
        expect(client.running).toBe(false);

        const restarted = client.connect();
        await h.clock.advance(delay - 1);
        expect(h.spawned).toHaveLength(index + 1);
        await h.clock.advance(1);
        await restarted;
        expect(h.spawned).toHaveLength(index + 2);
      }

      await crash(h.spawned[3]);
      await expect(client.connect()).rejects.toThrow(
        STDIO_RESTART_LIMIT_DETAIL,
      );
      await expect(client.listTools()).rejects.toThrow(
        STDIO_RESTART_LIMIT_DETAIL,
      );
      expect(h.spawned).toHaveLength(4);
      await h.host.dispose();
    });

    it('starts again with a fresh budget once the cap window passed (S1)', async () => {
      const h = harness();
      const client = h.host.createClient(h.options());
      await client.connect();
      for (const [index, delay] of STDIO_RESTART_BACKOFF_MS.entries()) {
        await crash(h.spawned[index]);
        const restarted = client.connect();
        await h.clock.advance(delay);
        await restarted;
      }
      await crash(h.spawned[3]);
      await expect(client.connect()).rejects.toThrow(
        STDIO_RESTART_LIMIT_DETAIL,
      );

      await h.clock.advance(STDIO_RESTART_WINDOW_MS - 1);
      await expect(client.connect()).rejects.toThrow(
        STDIO_RESTART_LIMIT_DETAIL,
      );
      await h.clock.advance(1);
      const retried = client.connect();
      // A fresh budget: the first restart waits 1 s again.
      await h.clock.advance(STDIO_RESTART_BACKOFF_MS[0]);
      await retried;
      expect(h.spawned).toHaveLength(5);
      expect(client.running).toBe(true);
      expect(h.logs).toContainEqual([
        'MCP gateway retries a capped stdio server',
        { server: 'local', status: 'retry' },
      ]);
      await h.host.dispose();
    });

    it('forgets restarts older than the window', async () => {
      const h = harness();
      const client = h.host.createClient(h.options());
      await client.connect();

      await crash(h.spawned[0]);
      const first = client.connect();
      await h.clock.advance(STDIO_RESTART_BACKOFF_MS[0]);
      await first;

      // Used on the way, so the idle sweep does not stop it first.
      await h.clock.advance(STDIO_RESTART_WINDOW_MS / 2);
      await client.callTool('search', {});
      await h.clock.advance(STDIO_RESTART_WINDOW_MS / 2);
      await client.callTool('search', {});
      expect(h.spawned).toHaveLength(2);
      await crash(h.spawned[1]);
      const second = client.connect();
      // The first restart left the window: this one waits 1 s again.
      await h.clock.advance(STDIO_RESTART_BACKOFF_MS[0]);
      await second;
      expect(h.spawned).toHaveLength(3);
      await h.host.dispose();
    });

    it('counts a failed start as a restart and reaps it', async () => {
      let fail = true;
      const h = harness(() => fail);
      const client = h.host.createClient(h.options());
      await expect(client.connect()).rejects.toThrow('ENOENT');
      expect(h.host.liveCount()).toBe(0);

      fail = false;
      const retry = client.connect();
      await h.clock.advance(STDIO_RESTART_BACKOFF_MS[0] - 1);
      expect(h.spawned).toHaveLength(1);
      await h.clock.advance(1);
      await retry;
      expect(h.spawned).toHaveLength(2);
      await h.host.dispose();
    });
  });

  describe('idle shutdown', () => {
    it('stops an unused process after 10 minutes with one sweep interval', async () => {
      const h = harness();
      const onToolsChanged = jest.fn();
      const a = h.host.createClient(h.options({ onToolsChanged }));
      const b = h.host.createClient(
        h.options({ serverName: 'other', spec: { ...SPEC, args: ['b.js'] } }),
      );
      await a.connect();
      await b.connect();
      expect(h.clock.intervalCount()).toBe(1);

      await h.clock.advance(STDIO_IDLE_MS + 60_000);
      expect(h.host.liveCount()).toBe(0);
      expect(h.killed).toEqual([h.spawned[0].pid, h.spawned[1].pid]);
      expect(h.clock.intervalCount()).toBe(0);

      // The next call starts it again at once: not a restart.
      await a.callTool('search', {});
      expect(h.spawned).toHaveLength(3);
      expect(onToolsChanged).toHaveBeenCalledTimes(1);
      await h.host.dispose();
    });

    it('never stops a process with a call in flight', async () => {
      const h = harness();
      const client = h.host.createClient(h.options());
      await client.connect();
      const call = client.callTool('slow', {});
      await flush();

      await h.clock.advance(STDIO_IDLE_MS * 2);
      expect(h.host.liveCount()).toBe(1);
      h.release();
      await call;
      await h.host.dispose();
    });
  });

  describe('dispose', () => {
    it('kills every process tree and refuses new starts', async () => {
      const h = harness();
      const a = h.host.createClient(h.options());
      const b = h.host.createClient(
        h.options({ serverName: 'other', spec: { ...SPEC, args: ['b.js'] } }),
      );
      await a.connect();
      await b.connect();

      await h.host.dispose();
      expect(h.killed.sort()).toEqual(
        [h.spawned[0].pid, h.spawned[1].pid].sort(),
      );
      expect(h.host.liveCount()).toBe(0);
      expect(h.clock.intervalCount()).toBe(0);
      await expect(a.connect()).rejects.toThrow('shut down');
      expect(h.spawned).toHaveLength(2);
    });
  });

  describe('dispose during a restart back-off', () => {
    it('starts no process once the host is disposed', async () => {
      const h = harness();
      const client = h.host.createClient(h.options());
      await client.connect();
      await crash(h.spawned[0]);

      const restart = client.connect().catch((error: unknown) => error);
      await h.host.dispose();
      await h.clock.advance(STDIO_RESTART_BACKOFF_MS[0]);
      expect(String(await restart)).toContain('shut down');
      expect(h.spawned).toHaveLength(1);
    });
  });

  describe('stderr and logs', () => {
    it('keeps the last 50 stderr lines, redacted', async () => {
      const h = harness();
      const client = h.host.createClient(h.options());
      await client.connect();
      const [{ stderr }] = h.spawned;
      for (let i = 0; i < 60; i++) stderr.write(`line ${i} ${SECRET}\n`);
      await flush();

      const tail = client.stderrTail();
      expect(tail).toHaveLength(STDIO_STDERR_LINES);
      expect(tail[0]).toBe('line 10 <redacted>');
      expect(tail.join('\n')).not.toContain(SECRET);
      await h.host.dispose();
    });

    it('logs the server name and status only', async () => {
      const h = harness();
      const client = h.host.createClient(h.options());
      await client.connect();
      h.spawned[0].stderr.write(`boom ${SECRET}\n`);
      await flush();
      await crash(h.spawned[0]);

      const logged = JSON.stringify(h.logs);
      expect(logged).toContain('local');
      expect(logged).not.toContain(SECRET);
      expect(logged).not.toContain('server.js');
      await h.host.dispose();
    });
  });
});
