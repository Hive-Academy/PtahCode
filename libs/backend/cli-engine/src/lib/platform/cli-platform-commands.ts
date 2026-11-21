/**
 * CLI Platform Commands Implementation
 *
 * Implements IPlatformCommands for the CLI/TUI environment. The CLI has no
 * window, terminal pane, or chat UI, so `reloadWindow` / `openTerminal` /
 * `focusChat` are no-ops. Breadcrumbs are written to stderr under --verbose
 * ONLY — never stdout, which carries the JSON-RPC NDJSON machine stream.
 *
 * It additionally implements the OPTIONAL `IAuthCommandRunner` capability from
 * `@ptah-extension/rpc-handlers`. `openTerminal` being a no-op here is what
 * made `auth:codexLogin` a silent success: the handler had no way to run the
 * command or observe its outcome. `runAuthCommand` spawns the command for
 * real, streams its output as push events so a TUI can render the device code,
 * and resolves with the actual exit status. Handlers probe for the capability
 * structurally, so VS Code and Electron keep the `openTerminal` path untouched.
 */

import spawn from 'cross-spawn';
import {
  defaultOrphanCleanupDependencies,
  killProcessTree,
  scheduleWindowsOrphanCleanup,
  type ProcessQuery,
} from '@ptah-extension/platform-core';
import type { IPlatformCommands } from '@ptah-extension/rpc-handlers';
import type {
  AuthCommandRequest,
  AuthCommandResult,
  IAuthCommandRunner,
} from '@ptah-extension/rpc-handlers';
import { MESSAGE_TYPES } from '@ptah-extension/shared';
import type {
  AuthDeviceCodePayload,
  AuthLoginOutputPayload,
} from '@ptah-extension/shared';

/**
 * Minimal push surface — matches `CliWebviewManagerAdapter.broadcastMessage`.
 * Typed structurally so this class does not depend on the transport module.
 */
export interface AuthCommandPushSink {
  broadcastMessage(type: string, payload: unknown): Promise<void>;
}

export interface CliPlatformCommandsOptions {
  verbose?: boolean;
  /**
   * Push sink for `runAuthCommand` output. When absent the command still runs
   * and its outcome is still reported — only the live output is dropped.
   */
  pushSink?: AuthCommandPushSink;
  /**
   * Override the {@link AUTH_COMMAND_TIMEOUT_MS} ceiling. Exists so the
   * timeout path is testable in bounded time; production omits it.
   */
  authCommandTimeoutMs?: number;
  processQuery?: ProcessQuery;
  killOrphan?: (pid: number) => Promise<void>;
  now?: () => number;
}

/**
 * Hard ceiling on an interactive auth command (10 min). Device codes issued by
 * `codex login --device-auth` expire well before this; the timeout only exists
 * so an abandoned login cannot pin a child process for the host's lifetime.
 */
const AUTH_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Matches a device/user code as printed by device-auth CLIs: groups of 4+
 * alphanumerics joined by hyphens (e.g. `ABCD-1234`). Deliberately narrow —
 * a miss only costs the dedicated `auth:deviceCode` event; the raw line is
 * always forwarded as `auth:loginOutput` regardless.
 */
const USER_CODE_PATTERN = /\b[A-Z0-9]{4,}(?:-[A-Z0-9]{4,})+\b/;
const URL_PATTERN = /https?:\/\/\S+/;

export class CliPlatformCommands
  implements IPlatformCommands, IAuthCommandRunner
{
  private readonly verbose: boolean;
  private readonly pushSink: AuthCommandPushSink | undefined;
  private readonly authCommandTimeoutMs: number;
  private readonly processQuery: ProcessQuery;
  private readonly killOrphan: (pid: number) => Promise<void>;
  private readonly now: () => number;

  constructor(options: CliPlatformCommandsOptions = {}) {
    this.verbose = options.verbose === true;
    this.pushSink = options.pushSink;
    this.authCommandTimeoutMs =
      options.authCommandTimeoutMs ?? AUTH_COMMAND_TIMEOUT_MS;
    this.processQuery = options.processQuery ?? defaultOrphanCleanupDependencies.query;
    this.killOrphan = options.killOrphan ?? defaultOrphanCleanupDependencies.kill;
    this.now = options.now ?? Date.now;
  }

  async reloadWindow(): Promise<void> {
    this.breadcrumb('reloadWindow');
  }

  openTerminal(_name: string, _command: string): void {
    this.breadcrumb('openTerminal');
  }

  async focusChat(): Promise<void> {
    this.breadcrumb('focusChat');
  }

  /**
   * Headless hosts have no command surface. Reported rather than thrown so a
   * caller that reaches here (it should not — the profile leaves
   * `commandExecution` off) still gets a usable answer.
   */
  async executeCommand(
    command: string,
  ): Promise<{ handled: boolean; error?: string }> {
    this.breadcrumb('executeCommand');
    return {
      handled: false,
      error: `No command surface in the CLI: ${command}`,
    };
  }

  /**
   * Spawn an interactive auth command and resolve with its real outcome.
   *
   * stdout/stderr are piped (never inherited): the TUI owns the terminal, so
   * writing child output straight to the real stdout would corrupt the Ink
   * frame. Each line is forwarded as an `auth:loginOutput` push event instead,
   * and lines that look like a device code / verification URL additionally
   * produce an `auth:deviceCode` event.
   */
  async runAuthCommand(
    request: AuthCommandRequest,
  ): Promise<AuthCommandResult> {
    const [file, ...args] = request.command.split(/\s+/).filter(Boolean);
    if (!file) {
      return {
        success: false,
        exitCode: null,
        error: 'Empty auth command.',
      };
    }

    return new Promise<AuthCommandResult>((resolve) => {
      const rootStartedAt = this.now();
      const child = spawn(file, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      let settled = false;
      let rootExitObserved = false;
      let treeKillRequested = false;
      // Start on 'exit': a descendant that holds an inherited pipe can delay
      // 'close' for as long as it lives. 'close' is the fallback.
      const startOrphanCleanup = (): void => {
        if (rootExitObserved) return;
        rootExitObserved = true;
        const exitedAt = this.now();
        if (treeKillRequested) return;
        scheduleWindowsOrphanCleanup(child.pid, rootStartedAt, false,
          (error) => this.reportOrphanError(error),
          { query: this.processQuery, kill: this.killOrphan, now: () => exitedAt });
      };
      child.once('exit', startOrphanCleanup);
      const settle = (result: AuthCommandResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };

      const timer = setTimeout(() => {
        if (!settled && child.exitCode === null && child.signalCode === null) {
          if (process.platform === 'win32' && child.pid !== undefined && Number.isSafeInteger(child.pid) && child.pid > 0) {
            treeKillRequested = true;
            const report = (error: unknown): void => {
              const failure = error instanceof Error ? error : new Error(String(error));
              process.stderr.write(`[ptah] Auth command tree stop failed: ${failure.message}\n`);
            };
            void killProcessTree(child.pid, 'SIGTERM', report)
              .catch((error: unknown) => report(error))
              .finally(() => {
                if (child.exitCode === null && child.signalCode === null) child.kill();
              });
          } else {
            child.kill();
          }
        }
        settle({
          success: false,
          exitCode: null,
          error: `${request.name} timed out after ${
            this.authCommandTimeoutMs
          }ms.`,
        });
      }, this.authCommandTimeoutMs);
      if (typeof (timer as { unref?: () => void }).unref === 'function') {
        (timer as { unref: () => void }).unref();
      }

      this.pipeLines(child.stdout, 'stdout', request.provider);
      this.pipeLines(child.stderr, 'stderr', request.provider);

      child.on('error', (error: Error) => {
        settle({
          success: false,
          exitCode: null,
          error: `Failed to run \`${request.command}\`: ${error.message}. Is it installed and on PATH?`,
        });
      });

      child.on('close', (code: number | null) => {
        startOrphanCleanup();
        settle(
          code === 0
            ? { success: true, exitCode: 0 }
            : {
                success: false,
                exitCode: code,
                error: `\`${request.command}\` exited with code ${String(code)}.`,
              },
        );
      });
    });
  }

  /**
   * Split a child stream into lines and forward each one as a push event.
   * Partial trailing data is buffered until the next chunk or stream end so a
   * device code split across two reads is never mangled.
   */
  private pipeLines(
    stream: NodeJS.ReadableStream | null,
    channel: 'stdout' | 'stderr',
    provider: string,
  ): void {
    if (!stream) return;
    let buffer = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        this.emitLine(provider, channel, line);
      }
    });
    stream.on('end', () => {
      if (buffer.length > 0) {
        this.emitLine(provider, channel, buffer);
        buffer = '';
      }
    });
  }

  private reportOrphanError(error: Error): void {
    process.stderr.write(`[ptah] Auth command orphan cleanup failed: ${error.message}\n`);
  }

  private emitLine(
    provider: string,
    channel: 'stdout' | 'stderr',
    rawLine: string,
  ): void {
    const line = rawLine.trimEnd();
    if (line.trim().length === 0) return;

    const outputPayload: AuthLoginOutputPayload = {
      provider,
      stream: channel,
      line,
    };
    this.push(MESSAGE_TYPES.AUTH_LOGIN_OUTPUT, outputPayload);

    const userCode = USER_CODE_PATTERN.exec(line)?.[0];
    const verificationUri = URL_PATTERN.exec(line)?.[0];
    if (!userCode && !verificationUri) return;

    const devicePayload: AuthDeviceCodePayload = {
      provider,
      ...(userCode !== undefined ? { userCode } : {}),
      ...(verificationUri !== undefined ? { verificationUri } : {}),
    };
    this.push(MESSAGE_TYPES.AUTH_DEVICE_CODE, devicePayload);
  }

  /** Best-effort push — a failing sink must never break the login. */
  private push(type: string, payload: unknown): void {
    // degradation-audit: reported - a broken push sink must never abort an
    // in-flight login; the failure is written to stderr under --verbose, the
    // same channel as this class's breadcrumbs (one line per output line).
    void this.pushSink?.broadcastMessage(type, payload).catch((error: unknown) => {
      if (this.verbose) {
        process.stderr.write(
          `[ptah] CliPlatformCommands.push failed (${type}): ${
            error instanceof Error ? error.name : typeof error
          }\n`,
        );
      }
    });
  }

  private breadcrumb(method: string): void {
    if (this.verbose) {
      process.stderr.write(`[ptah] CliPlatformCommands.${method} (no-op)\n`);
    }
  }
}
