import * as net from 'node:net';
import * as os from 'node:os';
import type { HeldDriverLock } from '../interfaces/session-driver-lock.interface';
import {
  controlEndpointName,
  controlKeysEqual,
  removeControlKey,
  writeControlKey,
  type ControlDiscovery,
} from './control-keys';

export type ControlReleaseResult =
  'released' | 'stranded' | 'in-use' | 'not-held';
export interface ControlLockSource {
  held(): HeldDriverLock[];
  hasLiveRecord(sessionId: string): boolean | Promise<boolean>;
  releaseIfIdle(
    sessionId: string,
    nonce: string,
  ): Promise<'in-use' | 'released' | 'stranded'>;
}
export interface ListedControlLock {
  sessionId: string;
  state: HeldDriverLock['state'];
  label: string;
  acquiredAt: string;
  hasLiveRecord: boolean;
}
export interface ControlListing {
  ok: true;
  pid: number;
  kind: ControlDiscovery['kind'];
  hostname: string;
  locks: ListedControlLock[];
}

let active: ControlEndpoint | undefined;
let starting: Promise<ControlEndpoint> | undefined;
// A Windows named pipe keeps its name while any accepted instance is open, so
// a new endpoint in this process must wait for the previous one to close.
let closing: Promise<void> | undefined;
const CLOSE_WAIT_MS = 2000;

/** Waits for the previous endpoint to close, but never longer than the bound. */
async function previousClose(): Promise<void> {
  const pending = closing;
  if (!pending) return;
  let timer: NodeJS.Timeout | undefined;
  const timedOut = await Promise.race([
    pending.then(() => false),
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(true), CLOSE_WAIT_MS);
      timer.unref();
    }),
  ]);
  clearTimeout(timer);
  // A bind that still collides then fails as an ordinary listen error.
  if (timedOut)
    console.warn(
      `[driver-lock] previous control endpoint still closing after ${CLOSE_WAIT_MS}ms pid=${process.pid}`,
    );
}
export class ControlEndpoint {
  private readonly sources = new Set<ControlLockSource>();
  private readonly connections = new Set<net.Socket>();
  private readonly server: net.Server;
  private readonly discovery: ControlDiscovery;
  private readonly onExit = (): void => {
    try {
      this.server.close();
    } catch {
      /* exiting */
    }
    removeControlKey(this.discovery.key);
  };
  private closed = false;

  private constructor(server: net.Server, discovery: ControlDiscovery) {
    this.server = server;
    this.discovery = discovery;
    process.on('exit', this.onExit);
  }

  static async register(
    kind: ControlDiscovery['kind'],
    source: ControlLockSource,
  ): Promise<ControlEndpoint> {
    if (!active) {
      starting ??= ControlEndpoint.start(kind);
      try {
        active = await starting;
      } finally {
        starting = undefined;
      }
    }
    active.sources.add(source);
    return active;
  }

  private static async start(
    kind: ControlDiscovery['kind'],
  ): Promise<ControlEndpoint> {
    await previousClose();
    const discovery = writeControlKey(kind);
    const server = net.createServer();
    const endpoint = new ControlEndpoint(server, discovery);
    server.on('connection', (socket) => endpoint.handle(socket));
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(controlEndpointName(process.pid), resolve);
      });
      // Operator control must not keep a finished process alive.
      server.unref();
      return endpoint;
    } catch (error) {
      process.removeListener('exit', endpoint.onExit);
      try {
        server.close();
      } catch {
        /* bind failed */
      }
      removeControlKey(discovery.key);
      throw error;
    }
  }

  /** Resolves once the endpoint name is free to bind again. */
  unregister(source: ControlLockSource): Promise<void> {
    this.sources.delete(source);
    if (this.sources.size || this.closed) return closing ?? Promise.resolve();
    this.closed = true;
    active = undefined;
    // close() waits for open connections; with no source left, their replies
    // no longer matter, so end them instead of waiting for their timeout.
    const closed = new Promise<void>((resolve) =>
      this.server.close(() => resolve()),
    );
    for (const socket of this.connections) socket.destroy();
    const current = closed.finally(() => {
      if (closing === current) closing = undefined;
    });
    closing = current;
    process.removeListener('exit', this.onExit);
    removeControlKey(this.discovery.key);
    return current;
  }

  private handle(socket: net.Socket): void {
    this.connections.add(socket);
    socket.once('close', () => this.connections.delete(socket));
    let data = '';
    socket.setTimeout(500, () => socket.destroy());
    socket.on('data', (chunk: Buffer) => {
      data += chunk.toString();
      if (Buffer.byteLength(data) > 4096) {
        socket.destroy();
        return;
      }
      const newline = data.indexOf('\n');
      if (newline < 0) return;
      socket.removeAllListeners('data');
      void this.respond(data.slice(0, newline)).then(
        (response) => socket.end(`${JSON.stringify(response)}\n`),
        () => socket.end('{"ok":false,"code":"UNAVAILABLE"}\n'),
      );
    });
    socket.on('error', () => {
      /* peer disconnected */
    });
  }

  private async hasLiveRecord(
    source: ControlLockSource,
    sessionId: string,
  ): Promise<boolean> {
    try {
      return await source.hasLiveRecord(sessionId);
    } catch {
      // degradation-audit: reported — an uncertain record is treated as live.
      return true;
    }
  }

  private async respond(line: string): Promise<unknown> {
    let request: unknown;
    try {
      request = JSON.parse(line);
    } catch {
      return { ok: false, code: 'BAD_REQUEST' };
    }
    if (!request || typeof request !== 'object')
      return { ok: false, code: 'BAD_REQUEST' };
    const input = request as {
      cmd?: unknown;
      key?: unknown;
      sessionId?: unknown;
    };
    if (!controlKeysEqual(this.discovery.key, input.key))
      return { ok: false, code: 'BAD_KEY' };
    if (input.cmd === 'list') {
      const locks: ListedControlLock[] = [];
      for (const source of this.sources)
        for (const entry of source.held()) {
          const hasLiveRecord = await this.hasLiveRecord(
            source,
            entry.sessionId,
          );
          locks.push({
            sessionId: entry.sessionId,
            state: entry.state,
            label: entry.owner.label,
            acquiredAt: entry.owner.acquiredAt,
            hasLiveRecord,
          });
        }
      return {
        ok: true,
        pid: process.pid,
        kind: this.discovery.kind,
        hostname: os.hostname(),
        locks,
      } satisfies ControlListing;
    }
    if (input.cmd === 'release' && typeof input.sessionId === 'string') {
      for (const source of this.sources) {
        const entry = source
          .held()
          .find((item) => item.sessionId === input.sessionId);
        if (!entry) continue;
        return {
          ok: true,
          result: await source.releaseIfIdle(entry.sessionId, entry.nonce),
        };
      }
      return { ok: true, result: 'not-held' };
    }
    return { ok: false, code: 'BAD_REQUEST' };
  }
}
