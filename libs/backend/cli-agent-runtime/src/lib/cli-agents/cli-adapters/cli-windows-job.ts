import type { ChildProcess } from 'node:child_process';
import { shouldUseWindowsJob, WINDOWS_JOB_ENV_KEY } from '@ptah-extension/platform-core';
import type { IWindowsJobAssigner, WindowsJobPolicy } from '@ptah-extension/platform-core';
import type { Logger } from '@ptah-extension/vscode-core';

export interface CliWindowsJobDependencies {
  readonly assigner?: IWindowsJobAssigner;
  readonly settingEnabled: () => boolean;
  readonly logger: Pick<Logger, 'debug' | 'error'>;
}

/** Retain the native handle until root exit or explicit stop. */
export function assignCliWindowsJob(
  child: ChildProcess,
  policy: WindowsJobPolicy | undefined,
  dependencies: CliWindowsJobDependencies | undefined,
): () => void {
  if (process.platform !== 'win32' || process.arch !== 'x64' || policy !== 'job' ||
      !dependencies?.assigner || child.pid === undefined) return () => undefined;
  let close = (): void => undefined;
  try {
    if (!shouldUseWindowsJob({ policy, platform: process.platform, arch: process.arch,
      settingEnabled: dependencies.settingEnabled(), env: process.env[WINDOWS_JOB_ENV_KEY] })) return close;
    const job = dependencies.assigner.assignToNewJob(child.pid);
    let closed = false;
    close = () => {
      if (closed) return;
      closed = true;
      try { job.close(); }
      catch (error: unknown) {
        // degradation-audit: reported - stop and snapshot cleanup must continue.
        dependencies.logger.error(`[WindowsJob] close failed pid=${child.pid} root=process`,
          error instanceof Error ? error : new Error(String(error)));
      }
    };
    child.once('exit', close);
    dependencies.logger.debug(`[WindowsJob] assigned pid=${child.pid} root=process`);
  } catch (error: unknown) {
    // degradation-audit: reported - keep the original root and snapshot cleanup.
    dependencies.logger.error(`[WindowsJob] assignment failed pid=${child.pid} root=process; snapshot cleanup active`,
      error instanceof Error ? error : new Error(String(error)));
  }
  return close;
}
