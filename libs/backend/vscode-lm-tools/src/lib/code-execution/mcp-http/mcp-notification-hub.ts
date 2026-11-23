/**
 * McpNotificationHub — the open GET SSE streams of the HTTP MCP server.
 *
 * The HTTP handler registers each authenticated `GET` stream here, keyed by
 * the caller's binding. When the gateway reports that a tool list may have
 * changed, the hub waits {@link DEFAULT_DEBOUNCE_MS} for the burst to settle
 * and then writes one `notifications/tools/list_changed` message to every
 * open stream. The message carries no data, so no stream learns anything
 * about another caller's tools.
 *
 * One shared keep-alive timer runs only while at least one stream is open;
 * the last `close` stops it. `closeAll` ends every stream so `server.close`
 * can finish.
 */

import type { McpCallerBinding } from '@ptah-extension/platform-core';
import type { Logger } from '@ptah-extension/vscode-core';

/** Quiet period after the last change before the notification is written. */
export const DEFAULT_DEBOUNCE_MS = 500;
/** Interval of the SSE comment that keeps idle proxies and clients attached. */
export const DEFAULT_KEEP_ALIVE_MS = 25_000;
/**
 * Most open streams one binding may hold. A client that reconnects without
 * closing its old stream would otherwise keep sockets alive forever; the
 * oldest stream of that binding is ended when a newer one passes the cap.
 */
export const MAX_STREAMS_PER_BINDING = 4;

const LIST_CHANGED_FRAME = `data: ${JSON.stringify({
  jsonrpc: '2.0',
  method: 'notifications/tools/list_changed',
})}\n\n`;
const KEEP_ALIVE_FRAME = ': keep-alive\n\n';

/** The part of `http.ServerResponse` the hub writes to. */
export interface McpNotificationStream {
  readonly destroyed: boolean;
  write(chunk: string): unknown;
  end(): unknown;
  once(event: 'close', listener: () => void): unknown;
}

export interface McpNotificationHubOptions {
  readonly logger: Logger;
  readonly debounceMs?: number;
  readonly keepAliveMs?: number;
}

/** Stable key of a binding: the caller identity fields, not the object. */
export function notificationBindingKey(binding: McpCallerBinding): string {
  return JSON.stringify([
    binding.kind,
    binding.agentId ?? null,
    binding.sessionId ?? null,
    binding.workspaceRoot ?? null,
    binding.toolProfile ?? null,
    binding.capability,
    binding.phaseKind ?? null,
  ]);
}

export class McpNotificationHub {
  private readonly streams = new Map<string, Set<McpNotificationStream>>();
  private readonly debounceMs: number;
  private readonly keepAliveMs: number;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private keepAliveTimer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly options: McpNotificationHubOptions) {
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.keepAliveMs = options.keepAliveMs ?? DEFAULT_KEEP_ALIVE_MS;
  }

  /** Number of open streams across every binding. */
  get streamCount(): number {
    let count = 0;
    for (const set of this.streams.values()) count += set.size;
    return count;
  }

  /** True while the shared keep-alive timer runs. */
  get keepAliveActive(): boolean {
    return this.keepAliveTimer !== undefined;
  }

  /**
   * Register an open stream under its caller's binding. The stream leaves the
   * hub on its own `close`.
   */
  register(binding: McpCallerBinding, stream: McpNotificationStream): void {
    const key = notificationBindingKey(binding);
    let set = this.streams.get(key);
    if (set === undefined) {
      set = new Set();
      this.streams.set(key, set);
    }
    set.add(stream);
    stream.once('close', () => this.remove(key, stream));
    while (set.size > MAX_STREAMS_PER_BINDING) {
      const oldest = set.values().next().value;
      if (oldest === undefined) break;
      this.remove(key, oldest);
      oldest.end();
    }
    this.ensureKeepAlive();
  }

  /** Debounced: a burst of changes produces one notification per stream. */
  notifyToolsChanged(): void {
    if (this.debounceTimer !== undefined) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      this.broadcast(LIST_CHANGED_FRAME);
    }, this.debounceMs);
    this.debounceTimer.unref?.();
  }

  /** End every stream and stop both timers. */
  closeAll(): void {
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    const open = [...this.streams.values()].flatMap((set) => [...set]);
    this.streams.clear();
    this.stopKeepAlive();
    for (const stream of open) {
      if (!stream.destroyed) stream.end();
    }
  }

  private remove(key: string, stream: McpNotificationStream): void {
    const set = this.streams.get(key);
    if (set === undefined || !set.delete(stream)) return;
    if (set.size === 0) this.streams.delete(key);
    if (this.streams.size === 0) this.stopKeepAlive();
  }

  private broadcast(frame: string): void {
    for (const [key, set] of [...this.streams]) {
      for (const stream of [...set]) {
        if (stream.destroyed) {
          this.remove(key, stream);
          continue;
        }
        try {
          stream.write(frame);
        } catch (error: unknown) {
          // degradation-audit: reported - a failed write drops only that
          // stream; the client reconnects and lists again.
          this.remove(key, stream);
          this.options.logger.warn(
            '[MCP] SSE notification write failed; stream dropped',
            { reason: error instanceof Error ? error.message : String(error) },
          );
        }
      }
    }
  }

  private ensureKeepAlive(): void {
    if (this.keepAliveTimer !== undefined || this.streams.size === 0) return;
    this.keepAliveTimer = setInterval(
      () => this.broadcast(KEEP_ALIVE_FRAME),
      this.keepAliveMs,
    );
    this.keepAliveTimer.unref?.();
  }

  private stopKeepAlive(): void {
    if (this.keepAliveTimer === undefined) return;
    clearInterval(this.keepAliveTimer);
    this.keepAliveTimer = undefined;
  }
}
