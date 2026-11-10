import { DestroyRef, Injectable, inject } from '@angular/core';
import { LoggingService } from './logging.service';

/** Length of every attribution string, so one script cannot flood the text bridge. */
const MAX_SCRIPT_TEXT_LENGTH = 80;

/** One script of a long frame, reduced to what the log carries. */
interface ScriptAttribution {
  readonly ms: number;
  readonly invoker: string;
  readonly fn: string;
  readonly src: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function cutText(value: unknown): string {
  return typeof value === 'string'
    ? value.slice(0, MAX_SCRIPT_TEXT_LENGTH)
    : '';
}

/** The last path segment of a script's source URL, without any query string. */
function sourceSegment(value: unknown): string {
  if (typeof value !== 'string') return '';
  const lastSegment = value.split(/[?#]/, 1)[0]?.split(/[/\\]/).pop();
  return cutText(lastSegment ?? '');
}

function toAttribution(script: unknown): ScriptAttribution {
  const record = isRecord(script) ? script : {};
  const duration = record['duration'];
  return {
    ms: typeof duration === 'number' ? duration : 0,
    invoker: cutText(record['invoker']),
    fn: cutText(record['sourceFunctionName']),
    src: sourceSegment(record['sourceURL']),
  };
}

/** The longest script of a long frame, or null when the frame reports none. */
function longestScript(scripts: unknown): ScriptAttribution | null {
  const list: readonly unknown[] = Array.isArray(scripts) ? scripts : [];
  let longest: ScriptAttribution | null = null;
  for (const script of list) {
    const attribution = toAttribution(script);
    if (longest === null || attribution.ms > longest.ms) longest = attribution;
  }
  return longest;
}

/** A field the DOM lib types do not declare for long-animation-frame entries. */
function frameField(entry: PerformanceEntry, field: string): unknown {
  return isRecord(entry) ? entry[field] : undefined;
}

@Injectable()
export class RendererFrameMonitorService {
  private readonly logger = inject(LoggingService);
  private readonly observer: PerformanceObserver | null;
  private lastLog = -10_000;

  constructor() {
    const types = typeof PerformanceObserver === 'undefined'
      ? [] : PerformanceObserver.supportedEntryTypes;
    const type = types.includes('long-animation-frame') ? 'long-animation-frame'
      : types.includes('longtask') ? 'longtask' : null;
    this.observer = type ? new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const now = performance.now();
        if (entry.duration <= 200 || now - this.lastLog < 10_000) continue;
        this.lastLog = now;
        // The renderer->host console bridge forwards text only, so the
        // metrics stay machine-readable as a trailing JSON object.
        const frame: Record<string, unknown> = {
          durationMs: Math.round(entry.duration),
          entryType: type,
        };
        if (type === 'long-animation-frame') {
          const blocking = frameField(entry, 'blockingDuration');
          if (typeof blocking === 'number') frame['blockingMs'] = Math.round(blocking);
          const script = longestScript(frameField(entry, 'scripts'));
          if (script !== null) frame['script'] = script;
        }
        this.logger.warn('RendererFrame', `long frame ${JSON.stringify(frame)}`);
      }
    }) : null;
    if (type) this.observer?.observe({ type });
    inject(DestroyRef).onDestroy(() => this.observer?.disconnect());
  }
}
