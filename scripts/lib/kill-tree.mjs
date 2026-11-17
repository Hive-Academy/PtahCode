import { spawnSync } from 'node:child_process';
import path from 'node:path';

const exited = new WeakSet();

function report(message, dependencies) {
  try {
    (dependencies.stderr ?? process.stderr).write(`${message}\n`);
  } catch {
    // degradation-audit: optional-capability - a failing diagnostic stream must not interrupt process cleanup.
  }
}

function asError(error) {
  return error instanceof Error ? error : new Error(String(error));
}

export function observeExit(child) {
  child.once('exit', () => exited.add(child));
}

export function killTree(target, signal = 'SIGTERM', dependencies = {}) {
  const child = typeof target === 'number' ? null : target;
  const pid = child ? child.pid : target;
  if (!Number.isSafeInteger(pid) || pid <= 0 ||
      (child && (exited.has(child) || child.exitCode !== null || child.signalCode !== null))) return { ok: true };
  if ((dependencies.platform ?? process.platform) === 'win32') {
    // Never start a bare `taskkill`: the Windows search path can find a file in the current directory.
    const env = dependencies.env ?? process.env;
    const root = [env.SystemRoot, env.windir].find((value) => typeof value === 'string' && path.win32.isAbsolute(value));
    if (!root || !path.win32.isAbsolute(root)) {
      const error = new Error(`taskkill skipped for PID ${pid}: SystemRoot is not an absolute path`);
      report(error.message, dependencies);
      return { ok: false, error };
    }
    const command = path.win32.join(root, 'System32', 'taskkill.exe');
    let result;
    try {
      result = (dependencies.spawnSync ?? spawnSync)(command, ['/PID', String(pid), '/T', '/F'], {
        windowsHide: true, encoding: 'utf8', timeout: 3000,
      });
    } catch (launchError) {
      const error = asError(launchError);
      report(`taskkill failed for PID ${pid}: ${error.message}`, dependencies);
      return { ok: false, error };
    }
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    if (!result.error && (result.status === 0 || result.status === 128 ||
        /not found|no running instance of the task/i.test(output))) return { ok: true };
    const error = new Error(`taskkill failed for PID ${pid}: ${result.error?.message ?? (output.trim() || `exit ${result.status}`)}`);
    report(error.message, dependencies);
    return { ok: false, error };
  }
  try {
    (dependencies.processKill ?? process.kill)(-pid, signal);
  } catch (error) {
    if (error?.code !== 'ESRCH') {
      const failure = new Error(`process group stop failed for PID ${pid}: ${error}`);
      report(failure.message, dependencies);
      return { ok: false, error: failure };
    }
  }
  return { ok: true };
}

/** Stop a child tree, then use the leader as a fallback only if it is still live. */
export function stopWithFallback(child, signal = 'SIGTERM', dependencies = {}) {
  const result = (dependencies.killTree ?? killTree)(child, signal, dependencies);
  if (result.ok || exited.has(child) || child.exitCode !== null || child.signalCode !== null) return result;
  try {
    child.kill('SIGKILL');
  } catch (error) {
    if (error?.code !== 'ESRCH') report(`root fallback failed for PID ${child.pid}: ${asError(error).message}`, dependencies);
  }
  return result;
}
