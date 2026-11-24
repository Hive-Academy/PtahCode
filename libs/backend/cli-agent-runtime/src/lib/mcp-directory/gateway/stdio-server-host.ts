/**
 * The gateway's host for Ptah-run stdio MCP servers (C10, P2).
 *
 * {@link StdioServerHost.createClient} returns an {@link UpstreamClient}, so
 * the gateway serves a local process exactly like a remote server: the same
 * `pending`/`connected`/`failed` states, the same back-off, the same
 * `<alias>__<tool>` names. This module and `upstream-client.ts` are the only
 * gateway modules that import `@modelcontextprotocol/sdk`.
 *
 * ## One process per server per root
 *
 * The gateway keys a stdio endpoint by (root, resolved command, args, env
 * hash), and makes one client per key; each client owns at most one
 * `StdioClientTransport` at a time, started with `cwd` = the root.
 *
 * ## Environment (M4)
 *
 * The child env is `getDefaultEnvironment()` (PATH, HOME and the like) plus
 * the entry's own, already expanded, `env`. The Ptah process env is never
 * passed whole, so provider keys and tokens never reach a third-party process.
 * The command is spawned as an argument array (`shell: false`).
 *
 * ## Restarts
 *
 * Every spawn after the first is a restart, except the first one after an
 * idle shutdown. A restart waits 1, 2, then 4 s. A fourth restart within
 * 10 minutes is refused: every connect throws for the next 10 minutes, then
 * the client starts again with a fresh restart budget (S1). A source change
 * gives the gateway a new key and a new client at once.
 *
 * ## Cold first list (S1)
 *
 * The first `tools/list` after a spawn gets {@link STDIO_FIRST_LIST_TIMEOUT_MS}
 * instead of the remote 5 s: a process that just finished an `npx` download
 * may answer its first list slowly, and the gateway would otherwise count
 * that as a failure. Later lists use the remote timeout.
 *
 * ## Idle shutdown
 *
 * A process with no call in flight and no use for 10 minutes is stopped. One
 * sweep interval runs for the whole host while any process lives. The next
 * call starts the process again and asks the gateway to re-list its tools.
 * The gateway starts a process only for a root that listed or called within
 * that window (S2), so a process whose cwd is a worktree stops at most
 * 10 minutes after its root's last use and no longer holds the folder.
 *
 * ## Shutdown
 *
 * Every stop kills the process tree first (`taskkill /T` on Windows), then
 * closes the transport, so an `npx` wrapper never leaves its server behind.
 * {@link StdioServerHost.dispose} stops every process. With the default
 * killer the host pre-loads the win32 kill at its first spawn, so a stop
 * started at quit spawns `taskkill` in the same tick (S3).
 *
 * SECURITY: logs carry the server name and status only. The command, its
 * arguments and the env are never logged; the stderr tail is logged at debug
 * with every env value and argument redacted.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  getDefaultEnvironment,
  StdioClientTransport,
  type StdioServerParameters,
} from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  killProcessTree,
  preloadProcessTreeKill,
} from '@ptah-extension/platform-core';
import type { Stream } from 'node:stream';
import {
  UPSTREAM_CALL_TIMEOUT_MS,
  UPSTREAM_LIST_TIMEOUT_MS,
  type UpstreamCallResult,
  type UpstreamClient,
  type UpstreamTool,
} from './upstream-client';

/** Handshake budget. Longer than HTTP: `npx` may download the package first. */
export const STDIO_CONNECT_TIMEOUT_MS = 60_000;
/** Delay before the 1st, 2nd and 3rd restart. */
export const STDIO_RESTART_BACKOFF_MS: readonly number[] = [
  1_000, 2_000, 4_000,
];
/** Restarts allowed within {@link STDIO_RESTART_WINDOW_MS}. */
export const STDIO_MAX_RESTARTS = 3;
export const STDIO_RESTART_WINDOW_MS = 10 * 60_000;
/** The first `tools/list` after a spawn; a cold `npx` start may list slowly. */
export const STDIO_FIRST_LIST_TIMEOUT_MS = 30_000;
/** A process unused for this long is stopped. */
export const STDIO_IDLE_MS = 10 * 60_000;
/** The one sweep interval of the host. */
export const STDIO_SWEEP_MS = 60_000;
/** stderr lines kept per server. */
export const STDIO_STDERR_LINES = 50;
/** Detail of a client that used up its restarts. */
export const STDIO_RESTART_LIMIT_DETAIL = `stopped after ${STDIO_MAX_RESTARTS} restarts in 10 minutes; retries after 10 minutes`;

const MAX_LIST_PAGES = 50;
const MAX_STDERR_LINE = 500;
const CLIENT_INFO = { name: 'ptah-gateway', version: '1.0.0' } as const;

/** What is spawned for one stdio server. */
export interface StdioServerSpec {
  /** Resolved command; spawned without a shell. */
  readonly command: string;
  readonly args: readonly string[];
  /** The entry's own env, expanded. Never the Ptah process env. */
  readonly env: Readonly<Record<string, string>>;
  /** The workspace root the server serves. */
  readonly cwd: string;
}

/** The transport surface the host uses; the SDK's `StdioClientTransport`. */
export interface StdioTransportHandle extends Transport {
  readonly pid: number | null;
  readonly stderr: Stream | null;
}

export type StdioTransportFactory = (
  params: StdioServerParameters,
) => StdioTransportHandle;

export interface StdioHostLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
}

/** Timers and time, injectable for specs. */
export interface StdioHostClock {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface StdioServerHostDeps {
  readonly createTransport?: StdioTransportFactory;
  /** Kills a process and its descendants. */
  readonly killTree?: (pid: number) => Promise<void>;
  readonly logger?: StdioHostLogger;
  readonly clock?: StdioHostClock;
}

export interface StdioClientOptions {
  readonly spec: StdioServerSpec;
  /** For logs only. */
  readonly serverName: string;
  /** `list_changed`, or a restart after an idle shutdown. */
  readonly onToolsChanged?: () => void;
  /** The process exited on its own; the next call restarts it. */
  readonly onDisconnected?: () => void;
  readonly onTransportError?: (error: Error) => void;
}

/** A stdio client, with the diagnostics the host keeps for it. */
export interface StdioUpstreamClient extends UpstreamClient {
  /** The last stderr lines, redacted. */
  stderrTail(): readonly string[];
  /** Whether a process is running. */
  readonly running: boolean;
}

/** `getDefaultEnvironment()` plus the entry's own env, nothing else. */
export function buildStdioChildEnv(
  entryEnv: Readonly<Record<string, string>>,
): Record<string, string> {
  return { ...getDefaultEnvironment(), ...entryEnv };
}

const defaultClock: StdioHostClock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => {
    const handle = setTimeout(callback, ms);
    handle.unref?.();
    return handle;
  },
  clearTimeout: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
  setInterval: (callback, ms) => {
    const handle = setInterval(callback, ms);
    handle.unref?.();
    return handle;
  },
  clearInterval: (handle) =>
    clearInterval(handle as ReturnType<typeof setInterval>),
};

export class StdioServerHost {
  /** Clients with a process starting or running. */
  private readonly active = new Set<HostedStdioClient>();
  /** Clients with a running process; the sweep reads these. */
  private readonly live = new Set<HostedStdioClient>();
  private sweepHandle: unknown = null;
  private disposed = false;
  private killPreloaded = false;
  readonly clock: StdioHostClock;

  constructor(private readonly deps: StdioServerHostDeps = {}) {
    this.clock = deps.clock ?? defaultClock;
  }

  createClient(options: StdioClientOptions): StdioUpstreamClient {
    return new HostedStdioClient(options, this);
  }

  /** Running processes; for status and specs. */
  liveCount(): number {
    return this.live.size;
  }

  /** Stop every process and refuse new ones. Never rejects. */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.stopSweep();
    const all = [...this.active];
    await Promise.all(all.map((client) => client.close()));
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  get logger(): StdioHostLogger | undefined {
    return this.deps.logger;
  }

  spawn(params: StdioServerParameters): StdioTransportHandle {
    this.preloadKill();
    return (this.deps.createTransport ?? createSdkTransport)(params);
  }

  /** Load the default win32 kill once, long before any quit needs it. */
  private preloadKill(): void {
    if (this.killPreloaded || this.deps.killTree !== undefined) return;
    this.killPreloaded = true;
    preloadProcessTreeKill().catch((error: unknown) => {
      // degradation-audit: reported - logged; the kill loads the module itself
      // when it runs, only later than the same tick.
      this.deps.logger?.warn('MCP gateway could not pre-load the process kill', {
        error: error instanceof Error ? error.name : typeof error,
      });
    });
  }

  async killTree(pid: number, serverName: string): Promise<void> {
    try {
      await (this.deps.killTree ?? defaultKillTree)(pid);
    } catch (error: unknown) {
      // degradation-audit: reported - logged; the transport close that follows
      // still ends stdin and signals the direct child.
      this.deps.logger?.warn(
        'MCP gateway could not kill a stdio process tree',
        {
          server: serverName,
          error: error instanceof Error ? error.name : typeof error,
        },
      );
    }
  }

  markStarting(client: HostedStdioClient): void {
    this.active.add(client);
  }

  markLive(client: HostedStdioClient): void {
    this.live.add(client);
    this.startSweep();
  }

  markStopped(client: HostedStdioClient): void {
    this.active.delete(client);
    this.live.delete(client);
    if (this.live.size === 0) this.stopSweep();
  }

  private startSweep(): void {
    if (this.sweepHandle !== null || this.disposed) return;
    this.sweepHandle = this.clock.setInterval(
      () => this.sweep(),
      STDIO_SWEEP_MS,
    );
  }

  private stopSweep(): void {
    if (this.sweepHandle === null) return;
    this.clock.clearInterval(this.sweepHandle);
    this.sweepHandle = null;
  }

  private sweep(): void {
    const now = this.clock.now();
    for (const client of [...this.live]) {
      if (client.idleSince(now) >= STDIO_IDLE_MS) void client.stopIdle();
    }
  }
}

type EndReason = 'idle' | 'failure';

class HostedStdioClient implements StdioUpstreamClient {
  private client: Client | null = null;
  private transport: StdioTransportHandle | null = null;
  /** Captured at start: the transport forgets it once the process exits. */
  private pid: number | null = null;
  private connecting: Promise<Client> | null = null;
  private connectAbort: AbortController | null = null;
  private spawns = 0;
  private lastEnd: EndReason = 'failure';
  private readonly restarts: number[] = [];
  /** When the restart cap was reached; connects are refused for a window. */
  private cappedAt: number | null = null;
  /** The running process answered a `tools/list` (cold-list timeout used up). */
  private listedSinceSpawn = false;
  private lastUsed = 0;
  private inFlight = 0;
  private readonly stderrLines: string[] = [];
  private stderrPartial = '';

  constructor(
    private readonly options: StdioClientOptions,
    private readonly host: StdioServerHost,
  ) {}

  get running(): boolean {
    return this.client !== null;
  }

  stderrTail(): readonly string[] {
    return this.stderrLines.map((line) => this.redact(line));
  }

  async connect(signal?: AbortSignal): Promise<void> {
    await this.connected(signal);
  }

  async listTools(signal?: AbortSignal): Promise<UpstreamTool[]> {
    return this.inUse(signal, async (client) => {
      const timeout = this.listedSinceSpawn
        ? UPSTREAM_LIST_TIMEOUT_MS
        : STDIO_FIRST_LIST_TIMEOUT_MS;
      const deadline = AbortSignal.timeout(timeout);
      const listSignal =
        signal === undefined ? deadline : AbortSignal.any([signal, deadline]);
      const tools: UpstreamTool[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < MAX_LIST_PAGES; page++) {
        const result = await client.listTools(
          cursor === undefined ? undefined : { cursor },
          { signal: listSignal, timeout },
        );
        for (const tool of result.tools) tools.push(toUpstreamTool(tool));
        cursor = result.nextCursor;
        if (cursor === undefined || cursor === '') {
          if (this.client === client) this.listedSinceSpawn = true;
          return tools;
        }
      }
      throw new Error(
        `MCP stdio tools/list returned more than ${MAX_LIST_PAGES} pages`,
      );
    });
  }

  async callTool(
    name: string,
    args: Readonly<Record<string, unknown>>,
    signal?: AbortSignal,
  ): Promise<UpstreamCallResult> {
    return this.inUse(signal, async (client) => {
      const result = await client.callTool(
        { name, arguments: { ...args } },
        undefined,
        { signal, timeout: UPSTREAM_CALL_TIMEOUT_MS },
      );
      return { ...result };
    });
  }

  /** The owner's close (a failure, or a server no longer served). */
  async close(): Promise<void> {
    await this.stop('failure');
  }

  idleSince(now: number): number {
    return this.inFlight > 0 ? 0 : now - this.lastUsed;
  }

  async stopIdle(): Promise<void> {
    if (this.client === null || this.inFlight > 0) return;
    this.host.logger?.debug('MCP gateway stopped an idle stdio server', {
      server: this.options.serverName,
      status: 'idle',
    });
    await this.stop('idle');
  }

  private async inUse<T>(
    signal: AbortSignal | undefined,
    run: (client: Client) => Promise<T>,
  ): Promise<T> {
    const client = await this.connected(signal);
    this.inFlight += 1;
    this.lastUsed = this.host.clock.now();
    try {
      return await run(client);
    } finally {
      this.inFlight -= 1;
      this.lastUsed = this.host.clock.now();
    }
  }

  private async stop(reason: EndReason): Promise<void> {
    const client = this.client;
    const transport = this.transport;
    const pid = this.pid;
    this.client = null;
    this.transport = null;
    this.pid = null;
    this.connecting = null;
    // A start in progress sees the abort and reaps its own process.
    this.connectAbort?.abort();
    this.connectAbort = null;
    if (client === null || transport === null) return;
    this.lastEnd = reason;
    this.host.markStopped(this);
    await this.shutdown(client, transport, pid);
  }

  /** Kill the tree first, then close; a dead pid makes the close quick. */
  private async shutdown(
    client: Client | null,
    transport: StdioTransportHandle,
    pid: number | null,
  ): Promise<void> {
    if (pid !== null) await this.host.killTree(pid, this.options.serverName);
    try {
      if (client !== null) await client.close();
      else await transport.close();
    } catch (error: unknown) {
      // degradation-audit: reported - logged; the process tree was already
      // signalled and the session is dropped either way.
      this.host.logger?.debug('MCP gateway could not close a stdio transport', {
        server: this.options.serverName,
        error: error instanceof Error ? error.name : typeof error,
      });
    }
  }

  private connected(signal?: AbortSignal): Promise<Client> {
    if (this.client !== null) return Promise.resolve(this.client);
    if (this.connecting === null) {
      const controller = new AbortController();
      const attempt = this.open(controller.signal).finally(() => {
        if (this.connecting === attempt) {
          this.connecting = null;
          this.connectAbort = null;
        }
      });
      this.connecting = attempt;
      this.connectAbort = controller;
    }
    return signal === undefined
      ? this.connecting
      : abandonOnAbort(this.connecting, signal);
  }

  private async open(signal: AbortSignal): Promise<Client> {
    if (this.host.isDisposed) throw new Error('MCP stdio host is shut down');
    this.checkRestartCap();
    const restart = this.spawns > 0 && this.lastEnd !== 'idle';
    const respawn = this.spawns > 0;
    if (restart) {
      await this.awaitRestartSlot(signal);
      if (this.host.isDisposed) throw new Error('MCP stdio host is shut down');
    }

    this.spawns += 1;
    this.host.markStarting(this);
    const { spec } = this.options;
    const transport = this.host.spawn({
      command: spec.command,
      args: [...spec.args],
      env: buildStdioChildEnv(spec.env),
      cwd: spec.cwd,
      stderr: 'pipe',
    });
    transport.stderr?.on('data', (chunk: Buffer | string) =>
      this.recordStderr(chunk),
    );
    const client = new Client(CLIENT_INFO, {
      capabilities: {},
      listChanged: {
        tools: {
          autoRefresh: false,
          onChanged: () => this.options.onToolsChanged?.(),
        },
      },
    });
    client.onclose = () => {
      // Only a live process that no one stopped reports a crash.
      if (this.client !== client) return;
      this.client = null;
      this.transport = null;
      this.pid = null;
      this.lastEnd = 'failure';
      this.host.markStopped(this);
      this.reportFailure('exited');
      this.options.onDisconnected?.();
    };
    client.onerror = (error) => this.options.onTransportError?.(error);

    try {
      await client.connect(transport, {
        signal,
        timeout: STDIO_CONNECT_TIMEOUT_MS,
      });
    } catch (error: unknown) {
      // Not a swallow: the process is reaped and the error rethrown, so a
      // failed start leaves no process behind.
      this.lastEnd = 'failure';
      await this.shutdown(null, transport, transport.pid);
      this.host.markStopped(this);
      this.reportFailure('failed');
      throw error;
    }
    if (signal.aborted || this.host.isDisposed) {
      // `close()` or dispose ran while the handshake finished: do not
      // resurrect a process the owner already stopped.
      await this.shutdown(client, transport, transport.pid);
      this.host.markStopped(this);
      throw new Error('MCP stdio connect was cancelled');
    }
    this.client = client;
    this.transport = transport;
    this.pid = transport.pid;
    this.listedSinceSpawn = false;
    this.lastUsed = this.host.clock.now();
    this.host.markLive(this);
    this.host.logger?.debug('MCP gateway started a stdio server', {
      server: this.options.serverName,
      status: restart ? 'restarted' : 'started',
    });
    // The tools may differ from the list the gateway still holds.
    if (respawn) this.options.onToolsChanged?.();
    return client;
  }

  /**
   * Refuse while the cap holds. Once {@link STDIO_RESTART_WINDOW_MS} passed
   * since the cap was reached, the client starts over with a full budget.
   */
  private checkRestartCap(): void {
    if (this.cappedAt === null) return;
    if (this.host.clock.now() - this.cappedAt < STDIO_RESTART_WINDOW_MS) {
      throw new Error(STDIO_RESTART_LIMIT_DETAIL);
    }
    this.cappedAt = null;
    this.restarts.length = 0;
    this.host.logger?.debug('MCP gateway retries a capped stdio server', {
      server: this.options.serverName,
      status: 'retry',
    });
  }

  /** Wait out the restart back-off, or refuse once the cap is reached. */
  private async awaitRestartSlot(signal: AbortSignal): Promise<void> {
    const now = this.host.clock.now();
    while (
      this.restarts.length > 0 &&
      now - this.restarts[0] >= STDIO_RESTART_WINDOW_MS
    ) {
      this.restarts.shift();
    }
    if (this.restarts.length >= STDIO_MAX_RESTARTS) {
      this.cappedAt = now;
      this.host.logger?.warn('MCP gateway stopped restarting a stdio server', {
        server: this.options.serverName,
        status: 'failed',
      });
      throw new Error(STDIO_RESTART_LIMIT_DETAIL);
    }
    const delay = STDIO_RESTART_BACKOFF_MS[this.restarts.length];
    this.restarts.push(now);
    await sleep(this.host.clock, delay, signal);
  }

  private recordStderr(chunk: Buffer | string): void {
    const text = this.stderrPartial + chunk.toString();
    const lines = text.split(/\r?\n/);
    this.stderrPartial = (lines.pop() ?? '').slice(0, MAX_STDERR_LINE);
    for (const line of lines) {
      if (line === '') continue;
      this.stderrLines.push(line.slice(0, MAX_STDERR_LINE));
      if (this.stderrLines.length > STDIO_STDERR_LINES)
        this.stderrLines.shift();
    }
  }

  private reportFailure(status: 'exited' | 'failed'): void {
    const logger = this.host.logger;
    if (logger === undefined) return;
    logger.warn('MCP gateway stdio server stopped', {
      server: this.options.serverName,
      status,
    });
    const tail = this.stderrTail();
    if (tail.length > 0) {
      logger.debug('MCP gateway stdio server stderr', {
        server: this.options.serverName,
        stderr: tail,
      });
    }
  }

  /** Remove every env value and argument; either may be a secret. */
  private redact(line: string): string {
    const { spec } = this.options;
    let out = line;
    for (const secret of [...Object.values(spec.env), ...spec.args]) {
      if (secret.length >= 4) out = out.split(secret).join('<redacted>');
    }
    return out;
  }
}

function createSdkTransport(
  params: StdioServerParameters,
): StdioTransportHandle {
  return new StdioClientTransport(params);
}

function defaultKillTree(pid: number): Promise<void> {
  return killProcessTree(pid, 'SIGTERM');
}

/** Resolve after `ms`, or reject with the signal's reason once it aborts. */
function sleep(
  clock: StdioHostClock,
  ms: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<void>((resolve, reject) => {
    const onAbort = (): void => {
      clock.clearTimeout(handle);
      reject(signal.reason);
    };
    const handle = clock.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * `shared`, or a rejection with `signal`'s reason once it aborts. Leaves
 * `shared` running for the other callers.
 */
function abandonOnAbort<T>(
  shared: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    shared.catch(() => {
      // degradation-audit: optional-capability - this caller already left;
      // the attempt's failure reaches every caller still waiting on it.
    });
    return Promise.reject(signal.reason);
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    shared.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

function toUpstreamTool(tool: {
  name: string;
  title?: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}): UpstreamTool {
  return {
    name: tool.name,
    ...(tool.title === undefined ? {} : { title: tool.title }),
    ...(tool.description === undefined
      ? {}
      : { description: tool.description }),
    inputSchema: tool.inputSchema,
    ...(tool.outputSchema === undefined
      ? {}
      : { outputSchema: tool.outputSchema }),
    ...(tool.annotations === undefined
      ? {}
      : { annotations: tool.annotations }),
  };
}
