/**
 * Pure presentation helpers shared by the Schedules surfaces.
 *
 * The job cards, the detail drawer and the run history render the same derived
 * strings (timestamps, relative deltas, the next-run figure). They live here
 * as free functions so there is exactly one definition of "what does a paused
 * job's next run read as".
 */
import type { ScheduledJobDto } from '@ptah-extension/shared';
import { formatRelative as formatRelativeOwner } from '@ptah-extension/ui';

/** One labelled figure inside a job card's metric list. */
export interface CronJobMetric {
  /** Short column heading, e.g. `Next run`. */
  readonly label: string;
  /** Primary value. Never empty — falls back to an explicit phrase. */
  readonly value: string;
  /** Secondary line (relative time, human cron description) or `null`. */
  readonly hint: string | null;
  /** Render {@link value} in the monospace face (cron expressions). */
  readonly mono: boolean;
}

/** Placeholder for an absent timestamp. */
const NO_TIME = '—';

/**
 * Absolute local timestamp without seconds, or `—` when unknown. Falls back to the raw epoch
 * if the host `Intl` data rejects the value rather than throwing at render.
 */
export function formatTime(epochMs: number | null | undefined): string {
  if (epochMs === null || epochMs === undefined) return NO_TIME;
  try {
    const date = new Date(epochMs);
    const sameYear = date.getFullYear() === new Date().getFullYear();
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      ...(sameYear ? {} : { year: 'numeric' as const }),
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  } catch {
    return String(epochMs);
  }
}

/** Full locale timestamp including seconds (for a `title`), or `''` when unknown. */
export function formatExactTime(epochMs: number | null | undefined): string {
  if (epochMs === null || epochMs === undefined) return '';
  try {
    return new Date(epochMs).toLocaleString();
  } catch {
    return String(epochMs);
  }
}

/**
 * Coarse relative delta (`in 5m`, `3h ago`). Empty string when unknown, so
 * callers can drop the line entirely instead of rendering a placeholder.
 */
export function formatRelative(epochMs: number | null | undefined): string {
  if (epochMs === null || epochMs === undefined) return '';
  return formatRelativeOwner(epochMs, Date.now());
}

/**
 * The "Next run" figure of a job. A disabled job has no next occurrence even
 * if the backend left a stale `nextRunAt` on the record, so `enabled` is
 * checked before the timestamp.
 */
export function nextRunMetric(job: ScheduledJobDto): CronJobMetric {
  if (!job.enabled) {
    return { label: 'Next run', value: 'Paused', hint: null, mono: false };
  }
  if (job.nextRunAt === null) {
    return {
      label: 'Next run',
      value: 'Not scheduled',
      hint: null,
      mono: false,
    };
  }
  return {
    label: 'Next run',
    value: formatTime(job.nextRunAt),
    hint: formatRelative(job.nextRunAt),
    mono: false,
  };
}
