import { z } from 'zod';

const processRow = z.object({
  ProcessId: z.number(),
  ParentProcessId: z.number(),
  CreationDate: z.string().nullable(),
});
const rows = z.union([processRow, z.array(processRow)]);
const QUERY_TIMEOUT_MS = 3_000;
export const ROOT_TIME_TOLERANCE_MS = 1_000;

export type ProcessRow = z.infer<typeof processRow>;
export type ProcessQuery = () => Promise<ProcessRow[]>;

/** A bounded CIM query. The command and timeout are explicit for test injection. */
export async function queryWindowsProcesses(
  run: (file: string, args: string[], timeoutMs: number) => Promise<string>,
): Promise<ProcessRow[]> {
  const script = 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CreationDate | ConvertTo-Json -Compress';
  const systemRoot = process.env['SystemRoot'] ?? process.env['windir'];
  const executable = systemRoot
    ? String.raw`${systemRoot}\System32\WindowsPowerShell\v1.0\powershell.exe`
    : 'powershell.exe';
  const output = await run(executable,
    ['-NoProfile', '-NonInteractive', '-Command', script], QUERY_TIMEOUT_MS);
  if (!output.trim()) return [];
  const parsed = rows.parse(JSON.parse(output));
  return Array.isArray(parsed) ? parsed : [parsed];
}

function creationTime(value: string | null): number | undefined {
  if (value === null) return undefined;
  const epoch = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/.exec(value);
  const parsed = epoch ? Number(epoch[1]) : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

interface TimedRow {
  pid: number;
  parentPid: number;
  createdAtMs: number;
}

/** Finds live descendants of a root that exited within the supplied clock window.
 * A snapshot cannot link a grandchild once its intermediate parent has exited.
 */
export class WindowsOrphanDescendants {
  constructor(
    private readonly rootPid: number,
    private readonly rootStartedAtMs: number,
    private readonly rootExitedAtMs: number,
    private readonly query: ProcessQuery,
    private readonly kill: (pid: number) => Promise<void>,
    private readonly onError: (error: Error) => void,
  ) {}

  async stop(): Promise<void> {
    const live = await this.snapshot();
    if (live === undefined) return;

    const timed: TimedRow[] = live.flatMap((row) => {
      if (row.ProcessId === this.rootPid) return [];
      const createdAtMs = creationTime(row.CreationDate);
      return createdAtMs === undefined ? [] : [{
        pid: row.ProcessId,
        parentPid: row.ParentProcessId,
        createdAtMs,
      }];
    });
    const selected = new Map<number, TimedRow>();
    let frontier = timed.filter((row) =>
      row.parentPid === this.rootPid &&
      // Allow clock rounding at start; after exit, a reused root PID is unsafe.
      row.createdAtMs >= this.rootStartedAtMs - ROOT_TIME_TOLERANCE_MS &&
      row.createdAtMs <= this.rootExitedAtMs);
    const levels: TimedRow[][] = [];
    while (frontier.length > 0) {
      levels.push(frontier);
      for (const row of frontier) selected.set(row.pid, row);
      frontier = timed.filter((row) => {
        const parent = selected.get(row.parentPid);
        return parent !== undefined && !selected.has(row.pid) &&
          row.createdAtMs >= parent.createdAtMs;
      });
    }
    if (levels.length === 0) return;
    const current = await this.snapshot();
    if (current === undefined) return;
    const stillLive = new Set(current.map((row) =>
      `${row.ProcessId}:${row.ParentProcessId}:${creationTime(row.CreationDate)}`));
    // A race remains between this query and taskkill; a Windows job object is the complete fix.
    for (const level of levels.reverse()) {
      for (const row of level) {
        if (!stillLive.has(`${row.pid}:${row.parentPid}:${row.createdAtMs}`)) continue;
        try {
          await this.kill(row.pid);
        } catch (error: unknown) {
          this.report(error);
        }
      }
    }
  }

  /** One query. A failure is reported and gives no rows, so no process is selected. */
  private snapshot(): Promise<ProcessRow[] | undefined> {
    return this.query().catch((error: unknown) => {
      this.report(error);
      return undefined;
    });
  }

  private report(error: unknown): void {
    this.onError(error instanceof Error ? error : new Error(String(error)));
  }
}
