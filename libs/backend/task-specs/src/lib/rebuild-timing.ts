import type { Logger } from '@ptah-extension/vscode-core';

export interface RebuildTiming {
  trigger: string;
  enumerateMs: number;
  readMs: number;
  parseValidateMs: number;
  sqliteReplaceMs: number;
  listenerMs: number;
  waitedMs: number;
  totalMs: number;
  carriers: number;
  rows: number;
  coalesced: number;
  failed: boolean;
}

/** Keep diagnostic payloads limited to counts and durations. */
export function logRebuildTiming(logger: Pick<Logger, 'debug' | 'info' | 'warn'>, timing: RebuildTiming): void {
  const message = '[task-specs] index rebuild timing';
  const metrics = {
    trigger: timing.trigger,
    enumerateMs: Math.round(timing.enumerateMs),
    readMs: Math.round(timing.readMs),
    parseValidateMs: Math.round(timing.parseValidateMs),
    sqliteReplaceMs: Math.round(timing.sqliteReplaceMs),
    listenerMs: Math.round(timing.listenerMs),
    waitedMs: Math.round(timing.waitedMs),
    totalMs: Math.round(timing.totalMs),
    carriers: timing.carriers,
    rows: timing.rows,
    coalesced: timing.coalesced,
    failed: timing.failed,
  };
  const runMs = timing.totalMs - timing.waitedMs;
  if (runMs >= 2000) logger.warn(message, metrics);
  else if (runMs >= 250) logger.info(message, metrics);
  else logger.debug(message, metrics);
}
