import * as fs from 'fs';
import * as path from 'path';
import type { ElectronApplication, TestInfo } from '@playwright/test';

/** Preserve app logs before the launcher removes its temporary profile. */
export async function attachAppLogsOnFailure(
  app: ElectronApplication,
  testInfo: TestInfo,
): Promise<void> {
  if (testInfo.status === testInfo.expectedStatus) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  try {
    const capture = async (): Promise<void> => {
      const paths = await app.evaluate(({ app: electronApp }) => ({
        logs: electronApp.getPath('logs'),
        userData: electronApp.getPath('userData'),
      }));
      const userDataPath = await fs.promises.realpath(paths.userData);
      const logsPath = await fs.promises.realpath(paths.logs);
      const isInsideUserData = (candidate: string): boolean => {
        const relative = path.relative(userDataPath, candidate);
        return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
      };
      if (!isInsideUserData(logsPath)) {
        throw new Error('app logs are outside userData');
      }
      if (timedOut) return;
      for (const name of await fs.promises.readdir(logsPath)) {
        if (timedOut) return;
        if (!name.endsWith('.log')) continue;
        const file = path.join(logsPath, name);
        const resolvedFile = await fs.promises.realpath(file);
        if (!isInsideUserData(resolvedFile)) continue;
        if (!(await fs.promises.stat(resolvedFile)).isFile()) continue;
        if (timedOut) return;
        await testInfo.attach(`app-log-${name}`, {
          path: resolvedFile,
          contentType: 'text/plain',
        });
      }
    };
    await Promise.race([
      capture(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          reject(new Error('timed out'));
        }, 3000);
      }),
    ]);
  } catch (error: unknown) {
    testInfo.annotations.push({
      type: 'app-log-capture-failed',
      description: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}
