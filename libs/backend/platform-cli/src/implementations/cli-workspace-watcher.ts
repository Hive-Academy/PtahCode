/**
 * `CliWorkspaceWatcher` — `IWorkspaceWatcher` for the CLI and TUI hosts
 * (TASK_2026_437 C9, INV-1).
 *
 * Recursive watching runs in ONE supervised watch host: the bundled
 * `workspace-watch-host.mjs`, started with `child_process.fork` — never a
 * `worker_threads` Worker, because `@parcel/watcher` loads into one thread per
 * process and a restarted Worker host could not load it again. Supervision —
 * heartbeat watchdog, restart budget, degraded rescans and recovery, pacing,
 * containment — is `WorkspaceWatchSupervisor` (platform-core), the same one
 * `ElectronWorkspaceWatcher` wraps. This facade supplies the fork shim and a
 * clock whose timers never hold the process open.
 *
 * CLI-specific choices:
 * - The child's stdin and stdout are ignored. `ptah` speaks JSON-RPC on stdout
 *   and the TUI owns the terminal; a host line on either would corrupt them.
 *   The host reports over IPC. Its stderr is piped into a bounded 4 KB tail
 *   that is never logged on its own: the supervisor reads it once when the host
 *   fails, so a native crash that never reached IPC still leaves its last words
 *   on that one diagnostic line.
 * - The child, its IPC channel, its stderr pipe and every supervision timer are
 *   unref'd: a one-shot command that watched and forgot to dispose still
 *   exits. The host exits on its own when the channel closes, and
 *   `shutdownHostRuntime` (cli-engine) disposes the watcher on teardown. A
 *   long-lived session (`ptah interact`, the TUI) stays alive through its own
 *   stdin, not through this watcher.
 * - A missing bundle (a dev run before the build target exists) is a failed
 *   fork, not a spawned `node` that dies: the supervisor spends its budget in
 *   ~1.5 s without starting a process, degrades, and the CLI keeps running.
 */

import { fork, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  killProcessTree,
  defaultOrphanCleanupDependencies,
  scheduleWindowsOrphanCleanup,
  type ProcessQuery,
  WorkspaceWatchSupervisor,
  type IDisposable,
  type IWorkspaceWatcher,
  type WorkspaceChangeCoalescerClock,
  type WorkspaceChangeListener,
  type WorkspaceWatchHostForker,
  type WorkspaceWatchHostProcess,
  type WorkspaceWatchOptions,
  type WorkspaceWatchSupervisorOptions,
  type WorkspaceWatcherDiagnostic,
} from '@ptah-extension/platform-core';

/** The bundle the CLI build writes next to `main.mjs` and `tui.mjs`. */
export const CLI_WORKSPACE_WATCH_HOST_BUNDLE = 'workspace-watch-host.mjs';

/**
 * `<dir of the running bundle>/workspace-watch-host.mjs`. `main.mjs` and
 * `tui.mjs` share `dist/apps/ptah-cli`, so one resolution serves both (D7);
 * callers pass their bundle's `__dirname`, as the integrity and embedder
 * workers are resolved.
 */
export function resolveCliWorkspaceWatchHostPath(bundleDir: string): string {
  return path.join(bundleDir, CLI_WORKSPACE_WATCH_HOST_BUNDLE);
}

export interface CliWorkspaceWatcherOptions extends Omit<
  WorkspaceWatchSupervisorOptions,
  'host'
> {
  /** Absolute path of `workspace-watch-host.mjs`. */
  readonly hostPath: string;
}

/** Real time with unref'd timers, so supervision never keeps `ptah` alive. */
const UNREFERENCED_CLOCK: WorkspaceChangeCoalescerClock = {
  now: () => Date.now(),
  setTimer: (callback, delayMs) => setTimeout(callback, delayMs).unref(),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Most stderr characters kept per host; older output is dropped. */
export const CLI_WATCH_HOST_STDERR_TAIL_CHARS = 4_096;

/** One forked host behind the supervisor's host-process port. */
export class CliWorkspaceWatchHostProcess implements WorkspaceWatchHostProcess {
  private readonly child: ChildProcess;
  private readonly exitListeners: Array<(code: number | null) => void> = [];
  private exited = false;
  private treeKillRequested = false;
  private stderrTail = '';
  private readonly rootStartedAt: number;
  private orphanCleanupStarted = false;

  /** Throws when the bundle is missing or the fork itself fails. */
  constructor(hostPath: string, private readonly onDiagnostic?: (diagnostic: WorkspaceWatcherDiagnostic) => void,
    private readonly query: ProcessQuery = defaultOrphanCleanupDependencies.query,
    private readonly killOrphan: (pid: number) => Promise<void> = defaultOrphanCleanupDependencies.kill,
    private readonly now: () => number = Date.now) {
    if (!fs.existsSync(hostPath)) {
      throw new Error(`watch host bundle not found: ${hostPath}`);
    }
    this.rootStartedAt = this.now();
    this.child = fork(hostPath, [], {
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      // The parent's flags (`--inspect`, loaders) are not the host's.
      execArgv: [],
      windowsHide: true,
    });
    this.child.unref();
    (
      this.child.channel as { unref?: () => void } | null | undefined
    )?.unref?.();
    const stderr = this.child.stderr;
    if (stderr) {
      stderr.setEncoding('utf8');
      stderr.on('data', (chunk: string) => {
        this.stderrTail = (this.stderrTail + chunk).slice(
          -CLI_WATCH_HOST_STDERR_TAIL_CHARS,
        );
      });
      (stderr as { unref?: () => void }).unref?.();
    }
    // 'close', not 'exit': it follows the end of stderr, so the tail read on
    // failure holds everything the host wrote before it died.
    // Orphan cleanup starts on 'exit': a descendant that holds the stderr pipe
    // can delay 'close' for as long as it lives.
    this.child.once('exit', () => this.startOrphanCleanup());
    this.child.on('close', (code) => this.notifyExit(code));
    // A spawn or IPC failure. The host is unusable either way: end it, and
    // report the exit ourselves when the spawn failed and no 'exit' will come.
    this.child.on('error', () => {
      this.kill();
      if (this.child.pid === undefined) this.notifyExit(null);
    });
  }

  postMessage(message: unknown): void {
    // A closed channel means the exit is already on its way; that is the
    // failure the supervisor acts on.
    if (!this.child.connected) return;
    this.child.send(message as object);
  }

  on(event: 'message', listener: (message: unknown) => void): void;
  on(event: 'exit', listener: (code: number | null) => void): void;
  on(
    event: 'message' | 'exit',
    listener: ((message: unknown) => void) | ((code: number | null) => void),
  ): void {
    if (event === 'message') {
      this.child.on('message', listener as (message: unknown) => void);
    } else {
      this.exitListeners.push(listener as (code: number | null) => void);
    }
  }

  readStderrTail(): string {
    return this.stderrTail;
  }

  kill(): void {
    if (this.exited || this.child.exitCode !== null || this.child.signalCode !== null) return;
    const pid = this.child.pid;
    if (process.platform === 'win32' && pid !== undefined && Number.isSafeInteger(pid) && pid > 0) {
      this.treeKillRequested = true;
      void killProcessTree(pid, 'SIGTERM', (error) => this.reportStopError(error instanceof Error ? error : new Error(String(error))))
        .catch((error: unknown) => this.reportStopError(error instanceof Error ? error : new Error(String(error))))
        .finally(() => {
          if (!this.exited && this.child.exitCode === null && this.child.signalCode === null) this.child.kill();
        });
      return;
    }
    this.child.kill();
  }

  private reportStopError(error: Error): void {
    try {
      this.onDiagnostic?.({ level: 'error', message: '[WorkspaceWatcher] tree stop failed', detail: { error } });
    } catch {
      // degradation-audit: optional-capability - a throwing diagnostic sink must not interrupt watch-host cleanup.
    }
  }

  private reportOrphanError(error: Error): void {
    try {
      this.onDiagnostic?.({ level: 'error', message: '[WorkspaceWatcher] orphan cleanup failed', detail: { error } });
    } catch {
      // degradation-audit: optional-capability - a throwing diagnostic sink must not interrupt orphan cleanup.
    }
  }

  private startOrphanCleanup(): void {
    if (this.orphanCleanupStarted) return;
    this.orphanCleanupStarted = true;
    const exitedAt = this.now();
    if (this.treeKillRequested) return;
    scheduleWindowsOrphanCleanup(this.child.pid, this.rootStartedAt, false,
      (error) => this.reportOrphanError(error),
      { query: this.query, kill: this.killOrphan, now: () => exitedAt });
  }

  private notifyExit(code: number | null): void {
    if (this.exited) return;
    this.exited = true;
    this.startOrphanCleanup();
    for (const listener of this.exitListeners) listener(code);
  }
}

/** Forks {@link CliWorkspaceWatchHostProcess} hosts of one bundle. */
export class CliWorkspaceWatchHostForker implements WorkspaceWatchHostForker {
  constructor(private readonly hostPath: string, private readonly onDiagnostic?: (diagnostic: WorkspaceWatcherDiagnostic) => void) {}

  fork(): WorkspaceWatchHostProcess {
    return new CliWorkspaceWatchHostProcess(this.hostPath, this.onDiagnostic);
  }
}

export class CliWorkspaceWatcher implements IWorkspaceWatcher {
  private readonly supervisor: WorkspaceWatchSupervisor;

  constructor(options: CliWorkspaceWatcherOptions) {
    const { hostPath, ...supervisorOptions } = options;
    this.supervisor = new WorkspaceWatchSupervisor({
      ...supervisorOptions,
      clock: supervisorOptions.clock ?? UNREFERENCED_CLOCK,
      host: new CliWorkspaceWatchHostForker(hostPath, supervisorOptions.onDiagnostic),
    });
  }

  /** True once the restart budget is spent, until a recovery host is confirmed. */
  get isDegraded(): boolean {
    return this.supervisor.isDegraded;
  }

  watch(
    root: string,
    options: WorkspaceWatchOptions,
    listener: WorkspaceChangeListener,
  ): IDisposable {
    return this.supervisor.watch(root, options, listener);
  }

  /** Stops the host and every subscription. Idempotent. */
  dispose(): void {
    this.supervisor.dispose();
  }
}
