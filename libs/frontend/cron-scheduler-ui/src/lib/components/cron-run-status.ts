/**
 * Pure view helpers for one scheduled-job run.
 *
 * A run status reaches the screen only through `ptah-status`, so this file maps
 * the wire status to that component's vocabulary and never returns a CSS class.
 */
import type { JobRunStatusDto } from '@ptah-extension/shared';
import type { PtahStatus } from '@ptah-extension/ui';

/** What `ptah-status` needs to render one run status. */
export interface RunStatusView {
  readonly status: PtahStatus;
  readonly label: string;
}

const RUN_STATUS_VIEWS: Readonly<Record<JobRunStatusDto, RunStatusView>> = {
  pending: { status: 'pending', label: 'Pending' },
  running: { status: 'running', label: 'Running' },
  succeeded: { status: 'completed', label: 'Succeeded' },
  failed: { status: 'failed', label: 'Failed' },
  skipped: { status: 'warning', label: 'Skipped' },
};

/** Maps a run status to the shared status vocabulary and a sentence-case label. */
export function runStatusView(status: JobRunStatusDto): RunStatusView {
  return RUN_STATUS_VIEWS[status];
}

const SECOND_MS = 1000;
const MINUTE_S = 60;
const HOUR_S = 3600;

/**
 * Wall-clock length of a run (`<1s`, `42s`, `3m 05s`, `1h 02m`). Empty string
 * when the run has not started or not ended, or when the clock went backwards,
 * so callers can drop the text instead of rendering a placeholder.
 */
export function formatRunDuration(
  startedAt: number | null,
  endedAt: number | null,
): string {
  if (startedAt === null || endedAt === null) return '';
  const elapsedMs = endedAt - startedAt;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return '';
  if (elapsedMs < SECOND_MS) return '<1s';

  const totalSeconds = Math.floor(elapsedMs / SECOND_MS);
  if (totalSeconds < MINUTE_S) return `${totalSeconds}s`;

  const seconds = totalSeconds % MINUTE_S;
  if (totalSeconds < HOUR_S) {
    return `${Math.floor(totalSeconds / MINUTE_S)}m ${pad(seconds)}s`;
  }

  const minutes = Math.floor((totalSeconds % HOUR_S) / MINUTE_S);
  return `${Math.floor(totalSeconds / HOUR_S)}h ${pad(minutes)}m`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
