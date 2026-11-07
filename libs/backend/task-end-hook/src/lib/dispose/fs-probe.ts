/**
 * Filesystem error classification shared by the disposal read probes. Each
 * helper only reads; none creates, moves or removes anything (C1).
 */
import * as fs from 'node:fs/promises';

/** Whether `error` is a confirmed missing path (`ENOENT` or `ENOTDIR`). */
export function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/** Real path of `target`, or `null` when it cannot be resolved. */
export async function realpathOrNull(target: string): Promise<string | null> {
  try {
    return await fs.realpath(target);
  } catch {
    // degradation-audit: reported - callers record `null` as a probe-error
    // code (or fall back to the lexical path key), never as a pass.
    return null;
  }
}
