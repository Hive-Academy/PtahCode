import type {
  IProcessSpawner,
  ProcessSpawnRequest,
  SpawnedProcessHandle,
} from '../interfaces/process-spawner.interface';

/** Output and exit state of one short command run to completion. */
export interface ProcessRunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  /** True when the timeout fired; output is what arrived before it. */
  readonly timedOut: boolean;
}

export interface ProcessRunOptions {
  /** Settle as timed out after this long and stop the process. */
  readonly timeoutMs: number;
  /** How to stop a timed-out process. Default `handle.kill()`. */
  readonly onTimeout?: (handle: SpawnedProcessHandle) => void;
  /** Bytes kept per stream; the rest is dropped. Default 64 KiB. */
  readonly maxOutputBytes?: number;
}

const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024;

/**
 * Run a short command (a `--version` probe, a status query) through an
 * {@link IProcessSpawner} and collect its output.
 *
 * Use this instead of `execFile` on a host where the spawner moves the launch
 * off the main thread: on Windows `child_process.spawn` is a synchronous
 * `CreateProcessW` that can block the Electron main process for seconds.
 *
 * Resolves on `close` with whatever the process wrote, or at the timeout with
 * the output so far (it does not wait for the killed process to close).
 * Rejects only when the process cannot start (`error` before `close`).
 */
export function runProcessToCompletion(
  spawner: IProcessSpawner,
  request: ProcessSpawnRequest,
  options: ProcessRunOptions,
): Promise<ProcessRunResult> {
  const limit = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  return new Promise<ProcessRunResult>((resolve, reject) => {
    let handle: ReturnType<IProcessSpawner['spawnProcess']>;
    try {
      handle = spawner.spawnProcess(request);
    } catch (error: unknown) {
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    const collect = (stream: NodeJS.ReadableStream | null) => {
      const chunks: Buffer[] = [];
      let size = 0;
      stream?.on('data', (chunk: Buffer | string) => {
        if (size >= limit) return;
        const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
        const kept = buffer.subarray(0, limit - size);
        chunks.push(kept);
        size += kept.length;
      });
      return () => Buffer.concat(chunks).toString('utf8');
    };
    const stdout = collect(handle.stdout);
    const stderr = collect(handle.stderr);
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      (options.onTimeout ?? ((h) => h.kill()))(handle);
      resolve({
        stdout: stdout(),
        stderr: stderr(),
        exitCode: null,
        signal: null,
        timedOut: true,
      });
    }, options.timeoutMs);
    timer.unref?.();
    // `on`, not `once`: a spawner may emit `error` more than once, and an
    // `error` event with no listener throws on the host thread.
    handle.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    handle.once('close', (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout: stdout(),
        stderr: stderr(),
        exitCode,
        signal,
        timedOut: false,
      });
    });
  });
}
