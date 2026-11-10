import { DestroyRef, Injectable, inject } from '@angular/core';
import { LoggingService } from './logging.service';

/** Electron forwards at most 256 UTF-8 bytes of each console line. */
const MAX_CONSOLE_BYTES = 256;
const MAX_SCRIPT_TEXT_BYTES = 24;
const CONSOLE_PREFIX = '[0000-00-00T00:00:00.000Z] [WARN] RendererFrame: ';
const encoder = new TextEncoder();

/** One script of a long frame, reduced to what the log carries. */
interface ScriptAttribution {
  readonly ms: number;
  readonly invoker: string;
  readonly type: string;
  readonly fn: string;
  readonly src: string;
  readonly layoutMs: number;
}

interface ScriptLog {
  i: number;
  ms: number;
  type?: string;
  invoker?: string;
  fn?: string;
  src?: string;
  layoutMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function cutText(value: unknown): string {
  if (typeof value !== 'string') return '';
  let result = '';
  for (const character of value) {
    if (encoder.encode(result + character).length > MAX_SCRIPT_TEXT_BYTES) break;
    result += character;
  }
  return result;
}

/** The last path segment of a script's source URL, without any query string. */
function sourceSegment(value: unknown): string {
  if (typeof value !== 'string') return '';
  const lastSegment = value.split(/[?#]/, 1)[0]?.split(/[/\\]/).pop();
  return cutText(lastSegment ?? '');
}

/**
 * The invoker of a script. A classic script reports its full URL here, and in
 * this app that is a local path, so a URL or path keeps only its last segment.
 */
function invokerText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return /[/\\]/.test(value) ? sourceSegment(value) : cutText(value);
}

function toAttribution(script: unknown): ScriptAttribution {
  const record = isRecord(script) ? script : {};
  const duration = record['duration'];
  return {
    ms: typeof duration === 'number' ? Math.round(duration) : 0,
    invoker: invokerText(record['invoker']),
    type: cutText(record['invokerType']),
    fn: invokerText(record['sourceFunctionName']),
    src: sourceSegment(record['sourceURL']),
    layoutMs: typeof record['forcedStyleAndLayoutDuration'] === 'number'
      ? Math.round(record['forcedStyleAndLayoutDuration']) : 0,
  };
}

function scriptLog(script: ScriptAttribution, i: number): ScriptLog {
  const data: ScriptLog = { i, ms: script.ms };
  if (script.type) data.type = script.type;
  if (script.invoker) data.invoker = script.invoker;
  if (script.fn) data.fn = script.fn;
  if (script.src) data.src = script.src;
  if (script.layoutMs) data.layoutMs = script.layoutMs;

  // The console line is the prefix, a space, and this message.
  // JSON escaping can grow a string after its UTF-8 byte cut, so fit the
  // complete line before passing it to LoggingService.
  const lineBytes = (): number => encoder.encode(
    `${CONSOLE_PREFIX} long frame script ${JSON.stringify(data)}`,
  ).length;
  while (lineBytes() > MAX_CONSOLE_BYTES) {
    const fields = ['type', 'invoker', 'fn', 'src'] as const;
    const largest = fields.reduce<(typeof fields)[number] | null>((best, key) =>
      data[key] && (!best || encoder.encode(data[key]).length > encoder.encode(data[best]).length)
        ? key : best, null);
    if (!largest) break;
    const shortened = [...(data[largest] ?? '')].slice(0, -1).join('');
    if (shortened) data[largest] = shortened;
    else delete data[largest];
  }
  return data;
}

/** The three longest scripts of a long frame. */
function topScripts(scripts: unknown): ScriptAttribution[] {
  const list: readonly unknown[] = Array.isArray(scripts) ? scripts : [];
  const duration = (script: unknown): number => {
    const value = isRecord(script) ? script['duration'] : undefined;
    return typeof value === 'number' ? value : 0;
  };
  return [...list].sort((a, b) => duration(b) - duration(a))
    .slice(0, 3).map(toAttribution);
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
        // The renderer->host console bridge forwards text only (an object
        // argument arrives as "[object Object]"), so the metrics stay
        // machine-readable as a trailing JSON object in the message.
        const frame: Record<string, unknown> = {
          durationMs: Math.round(entry.duration),
          entryType: type,
        };
        let scripts: ScriptAttribution[] = [];
        if (type === 'long-animation-frame') {
          const blocking = frameField(entry, 'blockingDuration');
          if (typeof blocking === 'number') frame['blockingMs'] = Math.round(blocking);
          const reported = frameField(entry, 'scripts');
          frame['scriptCount'] = Array.isArray(reported) ? reported.length : 0;
          scripts = topScripts(reported);
        }
        this.logger.warn('RendererFrame', `long frame ${JSON.stringify(frame)}`);
        scripts.forEach((script, index) => {
          this.logger.warn(
            'RendererFrame',
            `long frame script ${JSON.stringify(scriptLog(script, index + 1))}`,
          );
        });
      }
    }) : null;
    if (type) this.observer?.observe({ type });
    inject(DestroyRef).onDestroy(() => this.observer?.disconnect());
  }
}
