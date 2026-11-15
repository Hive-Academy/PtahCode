import type { PtahAPI } from '../types';

const STATUS_WAIT_MS = 2_000;

/** Unknown status conservatively preserves the earlier lane. */
export async function isSpawnReplayValid(
  agentId: string,
  status: PtahAPI['agent']['status'],
  warn: (error: unknown) => void,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), STATUS_WAIT_MS);
    });
    const current = await Promise.race([status(agentId), timeout]);
    if (current === 'timeout') return true;
    return !Array.isArray(current) && current?.status === 'running';
  } catch (error: unknown) {
    // degradation-audit: reported - a failed status lookup leaves lane state unknown; report and replay.
    warn(error);
    return true;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
