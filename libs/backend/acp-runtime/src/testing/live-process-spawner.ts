/**
 * Test-only: a plain `child_process.spawn` `IProcessSpawner` for the gated
 * live specs (`PTAH_LIVE_*`). The hosts use an off-thread spawner; this one
 * runs inline, which is fine for a spec that starts a handful of agents.
 */
import { spawn } from 'node:child_process';
import type {
  IProcessSpawner,
  ProcessErrorListener,
  ProcessExitListener,
  SpawnedProcessHandle,
} from '@ptah-extension/platform-core';

type Listener = ProcessExitListener | ProcessErrorListener;

export function createLiveProcessSpawner(): IProcessSpawner {
  return {
    spawnProcess: (request) => {
      const child = spawn(request.command, [...request.args], {
        cwd: request.cwd,
        env: Object.fromEntries(
          Object.entries(request.env).filter(([, value]) => value !== undefined),
        ) as NodeJS.ProcessEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: request.detached,
        windowsHide: !request.needsConsole,
      });
      const handle: SpawnedProcessHandle = {
        stdin: child.stdin,
        stdout: child.stdout,
        stderr: child.stderr,
        whenSpawned: new Promise((resolve) => {
          child.once('spawn', () => resolve(child.pid ?? null));
          child.once('error', () => resolve(null));
        }),
        get pid() {
          return child.pid;
        },
        get killed() {
          return child.killed;
        },
        get exitCode() {
          return child.exitCode;
        },
        kill: (signal) => child.kill(signal),
        on: (event: 'exit' | 'close' | 'error', listener: Listener) => {
          child.on(event, listener);
        },
        once: (event: 'exit' | 'close' | 'error', listener: Listener) => {
          child.once(event, listener);
        },
        off: (event: 'exit' | 'close' | 'error', listener: Listener) => {
          child.off(event, listener);
        },
      };
      return handle;
    },
  };
}
